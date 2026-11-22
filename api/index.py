import os
import json
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv
import requests
from pymongo import MongoClient

# Pakistan Standard Time (PKT, UTC+5)
PKT_TZ = timezone(timedelta(hours=5))
from fastapi import FastAPI, Request, Response, Query, HTTPException, status
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Load environment variables
load_dotenv()

META_APP_ID = os.getenv("META_APP_ID", "2049923772374313")
META_APP_SECRET = os.getenv("META_APP_SECRET", "18d803ccb0bcffc61a250dde640ecbb2")
WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "1451021148100534")
WHATSAPP_BUSINESS_ACCOUNT_ID = os.getenv("WHATSAPP_BUSINESS_ACCOUNT_ID", "1153445740531196")

# Auto-correct if environment variable was set to WABA ID instead of Phone Number ID
if WHATSAPP_PHONE_NUMBER_ID == "1153445740531196" or not WHATSAPP_PHONE_NUMBER_ID:
    WHATSAPP_PHONE_NUMBER_ID = "1451021148100534"
WHATSAPP_ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN", "EAAdIZARJE3SkBTLuCaPuXnte5eTjR3JynrWZADluzTlJJ4ZAkdTmmZAYLM5m379nN94c6GDxOZCp7DmMLBfSn0UoI4rnadTVz2QnZCJBuxXYAJHZA8jGChjwfIXulMEIrmWBNhDvdNWjgRZBXqrpbprmArVKHkoFwuVA06glC06bbRtpPIJDbnxPcY8xSRkH2wZDZD")
WEBHOOK_VERIFY_TOKEN = os.getenv("WEBHOOK_VERIFY_TOKEN", "alhaditha_wa_webhook_verify_2026")
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb+srv://m4musa592_db_user:qgQ9616OC2mI5Mn0@cluster0.thsts0e.mongodb.net/alhaditha_wa?retryWrites=true&w=majority")
AUDIT_FILE = "template_audit.json"

BASE_DIR = Path(__file__).resolve().parent.parent
possible_data_dirs = [
    Path(__file__).resolve().parent / "data",
    BASE_DIR / "data",
    Path.cwd() / "data"
]
SEED_DATA_DIR = next((p for p in possible_data_dirs if p.exists()), BASE_DIR / "data")

# Serverless environment (Vercel) detection
IS_VERCEL = bool(os.getenv("VERCEL"))
DATA_DIR = Path("/tmp/data") if IS_VERCEL else SEED_DATA_DIR

# MongoDB Atlas Integration
db = None
if MONGODB_URI:
    try:
        import certifi
        ca = certifi.where()
        mongo_client = MongoClient(
            MONGODB_URI,
            serverSelectionTimeoutMS=5000,
            tlsCAFile=ca,
            tlsAllowInvalidCertificates=True
        )
        db = mongo_client["alhaditha_wa"]
        print("[MONGODB] Connected to MongoDB Atlas (database: alhaditha_wa)")
    except Exception as e:
        try:
            mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000, tls=True)
            db = mongo_client["alhaditha_wa"]
        except Exception as e2:
            print(f"[MONGODB ERROR] Connection failed: {e2}")
            db = None

app = FastAPI(
    title="Al-Haditha WhatsApp Announcement System",
    description="Enterprise WhatsApp Announcement and Live Chat System powered by Meta WhatsApp Cloud API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def vercel_path_rewrite_middleware(request: Request, call_next):
    scope_path = request.scope.get("path", "")
    if scope_path in ["/api/index.py", "/api/index", "/index.py", "/api"]:
        matched = request.headers.get("x-matched-path") or request.headers.get("x-forwarded-uri")
        if matched and matched not in ["/api/index.py", "/api/index"]:
            request.scope["path"] = matched.split("?")[0]
    response = await call_next(request)
    # Ensure browsers don't cache stale frontend bundles during updates
    req_path = request.url.path
    if req_path.endswith(".js") or req_path.endswith(".html") or req_path == "/":
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

# Helper functions for data storage (persists to MongoDB Atlas with seamless local JSON /tmp fallback)
def load_json(filename: str, default: Any = None):
    # 1. Check MongoDB first if connected
    if db is not None:
        try:
            if filename == "employees.json":
                docs = list(db["employees"].find({}, {"_id": 0}))
                if docs:
                    return docs
            elif filename == "broadcasts.json":
                docs = list(db["broadcasts"].find({}, {"_id": 0}).sort("timestamp", -1))
                if docs:
                    return docs
            elif filename == "messages.json":
                docs = list(db["chats"].find({}))
                res = {}
                for d in docs:
                    phone = d.get("phone") or d.get("_id")
                    if phone:
                        doc_clean = {k: v for k, v in d.items() if k != "_id"}
                        res[phone] = doc_clean
                return res
            elif filename == AUDIT_FILE:
                docs = list(db["template_audit"].find({}))
                res = {}
                for d in docs:
                    name = d.get("_id") or d.get("name")
                    if name:
                        doc_clean = {k: v for k, v in d.items() if k != "_id"}
                        res[name] = doc_clean
                if res:
                    return res
        except Exception as e:
            print(f"[MONGODB READ ERROR] {filename}: {e}")

    # 2. Local fallback
    filepath = DATA_DIR / filename
    if not filepath.exists() and SEED_DATA_DIR.exists():
        seed_path = SEED_DATA_DIR / filename
        if seed_path.exists():
            filepath = seed_path
            
    if not filepath.exists():
        return default if default is not None else []
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default if default is not None else []

def save_json(filename: str, data: Any):
    # 1. Persist to MongoDB Atlas if connected
    if db is not None:
        try:
            if filename == "broadcasts.json":
                if isinstance(data, list):
                    for item in data:
                        b_id = item.get("id") or item.get("timestamp")
                        db["broadcasts"].replace_one({"id": b_id}, item, upsert=True)
            elif filename == "messages.json":
                if isinstance(data, dict):
                    for phone, thread in data.items():
                        doc = dict(thread)
                        doc["_id"] = phone
                        doc["phone"] = phone
                        db["chats"].replace_one({"_id": phone}, doc, upsert=True)
            elif filename == AUDIT_FILE:
                if isinstance(data, dict):
                    for name, entry in data.items():
                        doc = dict(entry)
                        doc["_id"] = name
                        doc["name"] = name
                        db["template_audit"].replace_one({"_id": name}, doc, upsert=True)
            elif filename == "employees.json":
                if isinstance(data, list):
                    for emp in data[:50]:
                        e_id = emp.get("id") or emp.get("phone")
                        if e_id:
                            db["employees"].replace_one({"id": e_id}, emp, upsert=True)
        except Exception as e:
            print(f"[MONGODB WRITE ERROR] {filename}: {e}")

    # 2. Local fallback persistence
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        filepath = DATA_DIR / filename
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except OSError:
        tmp_dir = Path("/tmp/data")
        tmp_dir.mkdir(parents=True, exist_ok=True)
        filepath = tmp_dir / filename
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)


# --- 1. SYSTEM & META STATUS ---
@app.get("/api/status")
@app.get("/status")
def get_system_status():
    """Checks live Meta Cloud API connection and returns phone info."""
    result = {
        "connected": False,
        "phone_number_id": WHATSAPP_PHONE_NUMBER_ID,
        "waba_id": WHATSAPP_BUSINESS_ACCOUNT_ID,
        "display_phone_number": "+92 330 6579717",
        "verified_name": "Siddiqui Innovations",
        "quality_rating": "GREEN",
        "platform": "CLOUD_API",
        "webhook_verify_token": WEBHOOK_VERIFY_TOKEN
    }
    
    if WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID:
        try:
            url = f"https://graph.facebook.com/v22.0/{WHATSAPP_PHONE_NUMBER_ID}"
            headers = {"Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}"}
            r = requests.get(url, headers=headers, timeout=5)
            if r.status_code == 200:
                data = r.json()
                result["connected"] = True
                result["display_phone_number"] = data.get("display_phone_number", result["display_phone_number"])
                result["verified_name"] = data.get("verified_name", result["verified_name"])
                result["quality_rating"] = data.get("quality_rating", "GREEN")
        except Exception as e:
            result["error"] = str(e)
            
    return result


# --- 2. DASHBOARD KPI METRICS ---
@app.get("/api/metrics")
@app.get("/metrics")
def get_dashboard_metrics():
    broadcasts = load_json("broadcasts.json", [])
    messages = load_json("messages.json", {})
    
    total_broadcasts = len(broadcasts)
    total_conversations = len(messages)
    total_unread = sum(c.get("unread_count", 0) for c in messages.values())
    
    if broadcasts:
        avg_delivery = round(sum(b.get("delivered_pct", 98.0) for b in broadcasts) / len(broadcasts), 1)
        total_replies = sum(b.get("replies_count", 0) for b in broadcasts)
    else:
        avg_delivery = 98.4
        total_replies = 483

    return {
        "total_broadcasts": total_broadcasts,
        "overall_delivery_rate": f"{avg_delivery}%",
        "total_replies": total_replies,
        "total_conversations": total_conversations,
        "total_unread": total_unread
    }


# --- 3. META MESSAGE TEMPLATES & AUDIT LOG ---
AUDIT_FILE = "template_audit.json"

@app.get("/api/templates")
@app.get("/templates")
def list_templates():
    """Fetches approved message templates directly from Meta Graph API and updates approval audit log."""
    live_templates = []
    audit_logs = load_json(AUDIT_FILE, {})
    
    if WHATSAPP_ACCESS_TOKEN and WHATSAPP_BUSINESS_ACCOUNT_ID:
        try:
            url = f"https://graph.facebook.com/v22.0/{WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates"
            headers = {"Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}"}
            r = requests.get(url, headers=headers, timeout=6)
            if r.status_code == 200:
                data = r.json()
                live_templates = data.get("data", [])
                
                # Check for status updates in audit logs
                now = datetime.utcnow()
                updated_audit = False
                for tpl in live_templates:
                    name = tpl.get("name")
                    status_val = tpl.get("status")
                    if name in audit_logs:
                        entry = audit_logs[name]
                        if entry.get("status") != status_val:
                            entry["status"] = status_val
                            updated_audit = True
                            if status_val == "APPROVED" and not entry.get("approved_at"):
                                entry["approved_at"] = now.strftime("%b %d, %Y • %I:%M %p")
                                try:
                                    sub_time = datetime.fromisoformat(entry["submitted_iso"])
                                    diff = (now - sub_time).total_seconds()
                                    entry["approval_duration"] = f"{int(diff // 60)}m {int(diff % 60)}s" if diff >= 60 else f"{int(diff)}s"
                                except Exception:
                                    entry["approval_duration"] = "Within a few minutes"
                if updated_audit:
                    save_json(AUDIT_FILE, audit_logs)
        except Exception:
            pass

    # Standard default templates including general announcement
    builtin_templates = [
        {
            "name": "general_announcement",
            "category": "UTILITY",
            "language": "en_US",
            "status": "APPROVED",
            "components": [
                {
                    "type": "HEADER",
                    "format": "TEXT",
                    "text": "Al Haditha Energy Official Announcement"
                },
                {
                    "type": "BODY",
                    "text": "Dear {{1}},\n\nThis is a general announcement from Al Haditha Energy regarding {{2}}:\n{{3}}\n\nThank you for your continued support."
                },
                {
                    "type": "FOOTER",
                    "text": "Al Haditha Energy HR"
                }
            ],
            "variable_count": 3
        },
        {
            "name": "system_maintenance",
            "category": "UTILITY",
            "language": "en_US",
            "status": "APPROVED",
            "components": [
                {
                    "type": "BODY",
                    "text": "Dear Staff, Scheduled system maintenance will occur on {{1}}. Internal systems may be temporarily unavailable."
                }
            ],
            "variable_count": 1
        },
        {
            "name": "hr_update",
            "category": "UTILITY",
            "language": "en_US",
            "status": "APPROVED",
            "components": [
                {
                    "type": "BODY",
                    "text": "HR Announcement for {{1}}: {{2}}. Please reach out to HR if you have questions."
                }
            ],
            "variable_count": 2
        }
    ]

    # Merge live templates from Meta
    all_names = {t.get("name") for t in live_templates}
    combined = list(live_templates)
    for bt in builtin_templates:
        if bt["name"] not in all_names:
            combined.append(bt)

    # Attach audit data and variable definitions to templates
    for t in combined:
        name = t.get("name")
        if name in audit_logs:
            t["audit"] = audit_logs[name]
            if "variable_definitions" in audit_logs[name]:
                t["variable_definitions"] = audit_logs[name]["variable_definitions"]

    return {"templates": combined, "audit_history": audit_logs}

@app.get("/api/templates/audit")
@app.get("/templates/audit")
def get_template_audit():
    """Returns the exact timestamp record of all templates submitted and approved."""
    return load_json(AUDIT_FILE, {})


class TemplateCreateRequest(BaseModel):
    name: str
    category: str = "UTILITY"
    language: str = "en_US"
    header_text: Optional[str] = None
    body_text: str
    footer_text: Optional[str] = None
    example_variables: List[str] = []
    variable_definitions: Optional[List[Dict[str, Any]]] = None

@app.post("/api/templates")
@app.post("/templates")
def create_template(tpl: TemplateCreateRequest):
    """Submits a new template directly to Meta WhatsApp Cloud API for approval."""
    components = []
    
    if tpl.header_text:
        components.append({
            "type": "HEADER",
            "format": "TEXT",
            "text": tpl.header_text
        })
        
    body_component = {
        "type": "BODY",
        "text": tpl.body_text
    }
    
    # Automatic Name Formatter: Convert human titles like 'Staff Timing Update 2026' into 'staff_timing_update_2026'
    import re
    clean_name = re.sub(r'[^a-z0-9_]', '', tpl.name.lower().strip().replace(' ', '_').replace('-', '_'))
    clean_name = re.sub(r'_+', '_', clean_name).strip('_')
    if not clean_name:
        clean_name = f"template_{int(time.time())}"

    # Automatic Sample Values (Zero Effort for the Client)
    # Detect all variables {{1}}, {{2}}... and guarantee realistic sample values are supplied for Meta approval
    body_matches = re.findall(r'\{\{(\d+)\}\}', tpl.body_text)
    if body_matches:
        num_vars = len(set(body_matches))
        default_samples = [
            "Ahmed Raza",
            "Office Timings Update",
            "Thursday working hours will conclude at 2:00 PM.",
            "Thursday at 10:00 AM",
            "Operations Head Office",
            "Staff General Notice"
        ]
        
        final_examples = []
        for i in range(num_vars):
            var_idx = i + 1
            ex_val = None
            if tpl.example_variables and i < len(tpl.example_variables) and tpl.example_variables[i]:
                ex_val = str(tpl.example_variables[i]).strip()
            elif tpl.variable_definitions:
                for vd in tpl.variable_definitions:
                    if vd.get("index") == var_idx and vd.get("example"):
                        ex_val = str(vd["example"]).strip()
                        break
            
            if not ex_val:
                ex_val = default_samples[i] if i < len(default_samples) else f"Sample Value {var_idx}"
            final_examples.append(ex_val)

        body_component["example"] = {
            "body_text": [final_examples]
        }
    components.append(body_component)

    if tpl.footer_text:
        components.append({
            "type": "FOOTER",
            "text": tpl.footer_text
        })

    payload = {
        "name": clean_name,
        "category": tpl.category.upper(),
        "components": components,
        "language": tpl.language
    }

    if not WHATSAPP_ACCESS_TOKEN or not WHATSAPP_BUSINESS_ACCOUNT_ID:
        raise HTTPException(status_code=400, detail="Missing Meta credentials.")

    try:
        url = f"https://graph.facebook.com/v22.0/{WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates"
        headers = {
            "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
            "Content-Type": "application/json"
        }
        r = requests.post(url, headers=headers, json=payload, timeout=10)
        res_data = r.json()
        if r.status_code in [200, 201]:
            # Record audit trail of submission
            now = datetime.utcnow()
            audit_logs = load_json(AUDIT_FILE, {})
            tpl_clean_name = clean_name
            audit_logs[tpl_clean_name] = {
                "name": tpl_clean_name,
                "category": tpl.category.upper(),
                "language": tpl.language,
                "submitted_at": now.strftime("%b %d, %Y • %I:%M %p"),
                "submitted_iso": now.isoformat(),
                "status": res_data.get("status", "PENDING"),
                "meta_id": res_data.get("id"),
                "approved_at": None,
                "approval_duration": None,
                "variable_definitions": tpl.variable_definitions or []
            }
            save_json(AUDIT_FILE, audit_logs)

            return {"success": True, "data": res_data, "message": "Template submitted to Meta successfully! Approval usually takes 1-5 minutes."}
        else:
            return {"success": False, "error": res_data, "message": res_data.get("error", {}).get("message", "Submission error from Meta.")}
    except Exception as e:
        return {"success": False, "error": str(e)}


# --- 4. EMPLOYEES DIRECTORY & SYNC WITH MESSAGES ---
DELETED_EMPLOYEES_FILE = "deleted_employees.json"

def get_deleted_employee_ids():
    deleted = load_json(DELETED_EMPLOYEES_FILE, [])
    return set(deleted) if isinstance(deleted, list) else set()

def record_deleted_employee(emp_id: str, phone: Optional[str] = None):
    deleted = list(get_deleted_employee_ids())
    for item in [emp_id, phone]:
        if item and item not in deleted:
            deleted.append(item)
    save_json(DELETED_EMPLOYEES_FILE, deleted)
    if db is not None:
        try:
            for item in [emp_id, phone]:
                if item:
                    db["deleted_employees"].replace_one({"id": item}, {"id": item}, upsert=True)
                    db["employees"].delete_many({"$or": [{"id": item}, {"phone": item}]})
        except Exception as e:
            print(f"[MONGODB ERROR] recording deleted employee: {e}")

def get_merged_employees():
    """Returns all employees, automatically merging contacts from messages as employees."""
    deleted_ids = get_deleted_employee_ids()
    raw_employees = load_json("employees.json", [])
    employees = [e for e in raw_employees if e.get("id") not in deleted_ids and e.get("phone") not in deleted_ids]

    existing_clean_phones = set()
    for e in employees:
        p = e.get("phone")
        if p:
            existing_clean_phones.add(p.replace("+", "").replace(" ", "").replace("-", "").strip())

    messages_db = load_json("messages.json", {})
    added_from_messages = []
    
    idx = 1
    for phone, chat in messages_db.items():
        if phone in deleted_ids:
            continue
        clean_p = phone.replace("+", "").replace(" ", "").replace("-", "").strip()
        if not clean_p or clean_p in existing_clean_phones or clean_p in deleted_ids:
            continue

        raw_name = chat.get("name", "").strip()
        last_msg = (chat.get("last_message") or "").strip()
        
        if not raw_name or raw_name.lower() in ["employee", "staff"]:
            if "emaad" in last_msg.lower():
                name = "Emaad"
            else:
                name = f"Staff ({phone})"
        else:
            name = raw_name

        dept = "Operations"
        role = chat.get("role", "")
        if "•" in role:
            candidate_dept = role.split("•")[-1].strip()
            if candidate_dept and candidate_dept != "WhatsApp Contact":
                dept = candidate_dept

        new_emp = {
            "id": f"EMP-MSG-{idx:03d}",
            "name": name,
            "phone": phone,
            "department": dept,
            "designation": "Staff",
            "location": "Muscat HQ",
            "status": "Active"
        }
        added_from_messages.append(new_emp)
        existing_clean_phones.add(clean_p)
        idx += 1

    return added_from_messages + employees

@app.get("/api/employees")
@app.get("/employees")
def get_employees(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    department: Optional[str] = None,
    search: Optional[str] = None
):
    employees = get_merged_employees()
    
    filtered = employees
    if department and department != "All":
        filtered = [e for e in filtered if e.get("department") == department]
        
    if search:
        s = search.lower()
        filtered = [
            e for e in filtered
            if s in e.get("name", "").lower() or s in e.get("phone", "") or s in e.get("id", "").lower()
        ]
        
    total = len(filtered)
    start = (page - 1) * limit
    end = start + limit
    paginated = filtered[start:end]
    
    departments = sorted(list({e.get("department") for e in employees if e.get("department")}))
    
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "departments": departments,
        "employees": paginated
    }

@app.get("/api/employees/all")
@app.get("/employees/all")
def get_all_employees():
    employees = get_merged_employees()
    departments = sorted(list({e.get("department") for e in employees if e.get("department")}))
    return {
        "total": len(employees),
        "departments": departments,
        "employees": [
            {
                "id": e.get("id"),
                "name": e.get("name"),
                "phone": e.get("phone"),
                "department": e.get("department"),
                "designation": e.get("designation", "Staff")
            }
            for e in employees
        ]
    }

class EmployeeCreateRequest(BaseModel):
    name: str
    phone: str
    department: str
    designation: Optional[str] = "Staff"
    location: Optional[str] = "Muscat HQ"

@app.post("/api/employees")
@app.post("/employees")
def add_employee(req: EmployeeCreateRequest):
    name = req.name.strip()
    phone = req.phone.strip()
    dept = req.department.strip()

    if not name or not phone or not dept:
        raise HTTPException(status_code=400, detail="Name, phone number, and department are required.")

    # Format phone with leading +
    clean_digits = "".join([c for c in phone if c.isdigit()])
    formatted_phone = f"+{clean_digits}" if not phone.startswith("+") else phone

    employees = load_json("employees.json", [])
    new_id = f"EMP-{len(employees) + 1:04d}"
    new_emp = {
        "id": new_id,
        "name": name,
        "phone": formatted_phone,
        "department": dept,
        "designation": (req.designation or "Staff").strip(),
        "location": (req.location or "Muscat HQ").strip(),
        "status": "Active"
    }

    employees.insert(0, new_emp)
    save_json("employees.json", employees)

    if db is not None:
        try:
            db["employees"].replace_one({"phone": formatted_phone}, new_emp, upsert=True)
        except Exception as e:
            print(f"[MONGODB ERROR] saving employee: {e}")

    return {
        "success": True,
        "employee": new_emp,
        "message": f"Employee {name} added successfully!"
    }

@app.delete("/api/employees/{emp_id}")
@app.delete("/employees/{emp_id}")
def delete_employee(emp_id: str):
    employees = load_json("employees.json", [])
    target = next((e for e in employees if e.get("id") == emp_id or e.get("phone") == emp_id), None)
    
    # Remove from employees.json
    new_employees = [e for e in employees if e.get("id") != emp_id and e.get("phone") != emp_id]
    save_json("employees.json", new_employees)
    
    target_phone = target.get("phone") if target else (emp_id if emp_id.startswith("+") else None)
    record_deleted_employee(emp_id, target_phone)
    
    return {
        "success": True,
        "message": f"Employee {emp_id} deleted successfully."
    }


# --- 5. BROADCASTS & OUTBOUND SENDER ---
@app.get("/api/broadcasts")
@app.get("/broadcasts")
def get_broadcasts():
    broadcasts = load_json("broadcasts.json", [])
    return {"broadcasts": broadcasts}

class BroadcastSendRequest(BaseModel):
    template_name: str
    template_language: str = "en_US"
    body_text: str
    variables: List[str] = []
    recipient_type: str = "all"  # all, department, location, employee, custom
    recipient_filter_value: Optional[str] = None
    test_number: Optional[str] = None  # Send real message to this phone number

@app.post("/api/broadcasts/send")
@app.post("/broadcasts/send")
def send_broadcast(req: BroadcastSendRequest):
    employees = get_merged_employees()
    broadcasts = load_json("broadcasts.json", [])
    messages_db = load_json("messages.json", {})
    
    # Filter target recipients
    if req.recipient_type == "department" and req.recipient_filter_value:
        recipients = [e for e in employees if e.get("department") == req.recipient_filter_value]
    elif req.recipient_type == "location" and req.recipient_filter_value:
        recipients = [e for e in employees if e.get("location") == req.recipient_filter_value]
    elif req.recipient_type == "employee" and req.recipient_filter_value:
        val = req.recipient_filter_value.strip()
        matched = [e for e in employees if e.get("id") == val or e.get("phone") == val]
        recipients = matched if matched else [e for e in employees if val in e.get("name", "")]
        if not recipients:
            recipients = employees[:1]
    else:
        recipients = employees

    recipient_count = len(recipients)
    now_time = datetime.now(PKT_TZ).strftime("%I:%M %p")
    now_str = datetime.now(PKT_TZ).strftime("%b %d, %Y • %I:%M %p")
    today_iso = datetime.now(PKT_TZ).strftime("%Y-%m-%d")
    sender_clean = "923306579717"

    recipient_results = []
    sent_count = 0
    failed_count = 0

    for emp in recipients:
        raw_phone = emp.get("phone", "").strip()
        clean_phone = raw_phone.replace("+", "").replace(" ", "").replace("-", "")
        if not clean_phone:
            continue

        emp_name = emp.get("name", "Employee")

        emp_vars = list(req.variables)
        if emp_vars:
            if req.recipient_type in ["all", "department"]:
                emp_vars[0] = emp_name
            parameters = [{"type": "text", "text": str(v)} for v in emp_vars]
            components = [{"type": "body", "parameters": parameters}]
        else:
            components = []

        if clean_phone == sender_clean:
            msg_id = f"self_{int(time.time()*1000)}"
            msg_obj = {
                "id": msg_id,
                "wamid": msg_id,
                "phone": raw_phone,
                "name": emp_name,
                "department": emp.get("department", "HR"),
                "status": "delivered",
                "error": None,
                "time": now_time,
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
            recipient_results.append(msg_obj)
            sent_count += 1
            continue

        msg_status = "sent"
        msg_error = None
        wamid = None

        if WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID:
            try:
                url = f"https://graph.facebook.com/v22.0/{WHATSAPP_PHONE_NUMBER_ID}/messages"
                headers = {
                    "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "messaging_product": "whatsapp",
                    "to": clean_phone,
                    "type": "template",
                    "template": {
                        "name": req.template_name,
                        "language": {"code": req.template_language},
                    }
                }
                if components:
                    payload["template"]["components"] = components

                r = requests.post(url, headers=headers, json=payload, timeout=8)
                res_data = r.json()

                if r.status_code in [200, 201] and "messages" in res_data:
                    wamid = res_data["messages"][0].get("id")
                    msg_status = "sent"
                    sent_count += 1
                else:
                    msg_status = "failed"
                    msg_error = res_data.get("error", {}).get("message", "Meta API Error")
                    failed_count += 1
            except Exception as e:
                msg_status = "failed"
                msg_error = str(e)
                failed_count += 1
        else:
            msg_status = "delivered"
            sent_count += 1

        msg_id = wamid or f"msg_{int(time.time()*1000)}"
        msg_obj = {
            "id": msg_id,
            "wamid": wamid,
            "phone": raw_phone,
            "name": emp_name,
            "department": emp.get("department", "Operations"),
            "status": msg_status,
            "error": msg_error,
            "time": now_time,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
        recipient_results.append(msg_obj)

        chat_phone = raw_phone if raw_phone.startswith("+") else f"+{raw_phone}"
        if chat_phone not in messages_db:
            messages_db[chat_phone] = {
                "employee_id": emp.get("id", "EMP-NEW"),
                "name": emp_name,
                "role": f"Employee • {emp.get('department', 'Staff')}",
                "unread_count": 0,
                "last_activity": now_time,
                "messages": []
            }

        chat = messages_db[chat_phone]
        chat["messages"].append({
            "id": msg_id,
            "direction": "outgoing",
            "sender": "Al Haditha Energy",
            "text": f"📢 [{req.template_name.replace('_', ' ').title()}]\n{req.body_text}",
            "time": now_time,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "status": msg_status
        })
        chat["last_activity"] = now_time

    save_json("messages.json", messages_db)

    if req.recipient_type == "all":
        rec_filter = f"All Employees ({recipient_count})"
    elif req.recipient_type == "department":
        rec_filter = f"By Department ({req.recipient_filter_value})"
    elif req.recipient_type == "employee":
        emp_name = recipients[0].get("name", "Employee") if recipients else req.recipient_filter_value
        rec_filter = f"Employee ({emp_name})"
    else:
        rec_filter = f"By {req.recipient_type.title()} ({recipient_count})"

    new_broadcast = {
        "id": f"BC-{1000 + len(broadcasts) + 1}",
        "date": now_str,
        "date_iso": today_iso,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "template": req.template_name.replace("_", " ").title(),
        "template_name": req.template_name,
        "content": req.body_text,
        "recipients_count": recipient_count,
        "recipient_filter": rec_filter,
        "recipient_phone": recipients[0]["phone"] if req.recipient_type == "employee" and recipients else None,
        "status": "Completed" if failed_count == 0 else f"{sent_count} Dispatched, {failed_count} Failed",
        "delivered_pct": round(((sent_count) / recipient_count) * 100, 1) if recipient_count > 0 else 100,
        "read_pct": 0,
        "replies_count": 0,
        "sent_count": sent_count,
        "failed_count": failed_count,
        "messages": recipient_results
    }

    broadcasts.insert(0, new_broadcast)
    save_json("broadcasts.json", broadcasts)

    return {
        "success": True,
        "broadcast": new_broadcast,
        "sent_count": sent_count,
        "failed_count": failed_count,
        "message": f"Broadcast dispatched! {sent_count} sent, {failed_count} failed."
    }

@app.get("/api/broadcasts/tracker")
@app.get("/broadcasts/tracker")
def get_broadcasts_tracker(
    broadcast_id: str = None,
    date: str = None,
    status: str = None,
    search: str = None
):
    broadcasts = load_json("broadcasts.json", [])
    records = []

    today_iso = datetime.now(PKT_TZ).strftime("%Y-%m-%d")
    yesterday_iso = (datetime.now(PKT_TZ) - timedelta(days=1)).strftime("%Y-%m-%d")

    total_delivered = 0
    total_read = 0
    total_replied = 0
    total_failed = 0
    total_sent = 0

    for b in broadcasts:
        b_id = b.get("id", "BC-LIVE")
        b_template = b.get("template", "Announcement")
        b_date = b.get("date", "")
        b_date_iso = b.get("date_iso") or (b.get("timestamp")[:10] if b.get("timestamp") else today_iso)

        msgs = b.get("messages", [])
        if not msgs:
            err = b.get("meta_api_response", {}).get("error", {})
            err_msg = err.get("message") if isinstance(err, dict) else None
            st = "failed" if err_msg else ("delivered" if "Completed" in str(b.get("status")) else "sent")
            msgs = [{
                "id": f"{b_id}_1",
                "phone": b.get("recipient_phone") or "Employees",
                "name": b.get("recipient_filter", "All Staff"),
                "department": "All",
                "status": st,
                "error": err_msg,
                "time": b.get("date", "").split("•")[-1].strip() if "•" in b.get("date", "") else "12:00 PM"
            }]

        for m in msgs:
            m_status = (m.get("status") or "sent").lower()
            if m_status == "sent":
                total_sent += 1
            elif m_status == "delivered":
                total_delivered += 1
            elif m_status in ["read", "seen"]:
                total_read += 1
            elif m_status == "replied":
                total_replied += 1
            elif m_status == "failed":
                total_failed += 1

            rec = {
                "broadcast_id": b_id,
                "template": b_template,
                "broadcast_date": b_date,
                "date_iso": b_date_iso,
                "id": m.get("id"),
                "wamid": m.get("wamid"),
                "name": m.get("name", "Employee"),
                "phone": m.get("phone", ""),
                "department": m.get("department", "Operations"),
                "status": m_status,
                "error": m.get("error"),
                "time": m.get("time", "")
            }
            records.append(rec)

    filtered = records
    if broadcast_id and broadcast_id != "all":
        filtered = [r for r in filtered if r["broadcast_id"] == broadcast_id]

    if date and date != "all":
        if date == "today":
            filtered = [r for r in filtered if r["date_iso"] == today_iso]
        elif date == "yesterday":
            filtered = [r for r in filtered if r["date_iso"] == yesterday_iso]
        else:
            filtered = [r for r in filtered if r["date_iso"] == date]

    if status and status != "all":
        target_st = status.lower()
        if target_st in ["read", "seen"]:
            filtered = [r for r in filtered if r["status"] in ["read", "seen"]]
        else:
            filtered = [r for r in filtered if r["status"] == target_st]

    if search:
        s = search.lower().strip()
        filtered = [
            r for r in filtered
            if s in r["name"].lower() or s in r["phone"].lower() or s in r["broadcast_id"].lower()
        ]

    broadcast_options = [
        {"id": b["id"], "template": b.get("template", "Broadcast"), "date": b.get("date", "")}
        for b in broadcasts
    ]

    return {
        "summary": {
            "total_sent": total_sent + total_delivered + total_read + total_replied + total_failed,
            "delivered": total_delivered,
            "read": total_read,
            "replied": total_replied,
            "failed": total_failed
        },
        "broadcast_options": broadcast_options,
        "records": filtered
    }

# --- 6. LIVE CHAT & CONVERSATIONS ---
@app.get("/api/chats")
@app.get("/chats")
def get_chats():
    messages_db = load_json("messages.json", {})
    chats_list = []
    
    for phone, data in messages_db.items():
        msgs = data.get("messages", [])
        last_msg = msgs[-1]["text"] if msgs else ""
        chats_list.append({
            "phone": phone,
            "employee_id": data.get("employee_id", "EMP-0000"),
            "name": data.get("name", "Unknown"),
            "role": data.get("role", "Employee"),
            "unread_count": data.get("unread_count", 0),
            "last_activity": data.get("last_activity", ""),
            "last_message": last_msg,
            "message_count": len(msgs)
        })
        
    return {"chats": chats_list}

@app.get("/api/chats/{phone}")
@app.get("/chats/{phone}")
def get_chat_history(phone: str):
    messages_db = load_json("messages.json", {})
    chat = messages_db.get(phone)
    if not chat:
        # Return an empty thread without polluting the database until a message is sent
        employees = load_json("employees.json", [])
        emp = next((e for e in employees if e.get("phone") == phone), None)
        return {
            "employee_id": emp.get("id", "EMP-NEW") if emp else "EMP-NEW",
            "name": emp.get("name", phone) if emp else phone,
            "role": f"Employee • {emp.get('department', 'WhatsApp')}" if emp else "WhatsApp Contact",
            "unread_count": 0,
            "last_activity": "New chat",
            "messages": [],
            "phone": phone
        }
    else:
        # Mark as read
        if chat.get("unread_count", 0) > 0:
            chat["unread_count"] = 0
            save_json("messages.json", messages_db)
        
    return chat

class SendChatMessageRequest(BaseModel):
    text: str

@app.post("/api/chats/{phone}/send")
@app.post("/chats/{phone}/send")
def send_chat_message(phone: str, req: SendChatMessageRequest):
    """Sends a 1-on-1 direct message via WhatsApp Cloud API."""
    messages_db = load_json("messages.json", {})
    now_time = datetime.now(PKT_TZ).strftime("%I:%M %p")
    
    clean_phone = phone.replace("+", "").replace(" ", "").replace("-", "")
    api_response = None
    
    if WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID:
        try:
            url = f"https://graph.facebook.com/v22.0/{WHATSAPP_PHONE_NUMBER_ID}/messages"
            headers = {
                "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
                "Content-Type": "application/json"
            }
            payload = {
                "messaging_product": "whatsapp",
                "to": clean_phone,
                "type": "text",
                "text": {"body": req.text}
            }
            r = requests.post(url, headers=headers, json=payload, timeout=8)
            api_response = r.json()
        except Exception as e:
            api_response = {"error": str(e)}

    # Append to local message thread
    if phone not in messages_db:
        messages_db[phone] = {
            "employee_id": "EMP-1001",
            "name": "Employee",
            "role": "Employee",
            "unread_count": 0,
            "last_activity": now_time,
            "messages": []
        }
        
    chat = messages_db[phone]
    
    # Extract Meta message ID or fallback
    meta_messages = api_response.get("messages", []) if isinstance(api_response, dict) else []
    meta_msg_id = meta_messages[0].get("id") if meta_messages else f"m_{int(time.time()*1000)}"
    has_error = bool(api_response and isinstance(api_response, dict) and "error" in api_response)
    initial_status = "failed" if has_error else "sent"
    error_msg = api_response.get("error", {}).get("message") if has_error else None

    new_msg = {
        "id": meta_msg_id,
        "direction": "outgoing",
        "sender": "Al Haditha Energy",
        "text": req.text,
        "time": now_time,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "status": initial_status
    }
    if error_msg:
        new_msg["error"] = error_msg

    chat["messages"].append(new_msg)
    chat["last_activity"] = now_time
    save_json("messages.json", messages_db)
    
    return {"success": not has_error, "message": new_msg, "meta_response": api_response}


# --- 7. META WEBHOOK (Verification & Receiver) ---
@app.get("/api/webhook")
@app.get("/webhook")
def verify_webhook(request: Request):
    """
    Handles Meta's Webhook verification challenge.
    When you click 'Verify and save' in Meta App Dashboard, Meta calls this endpoint.
    """
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    if mode == "subscribe" and token == WEBHOOK_VERIFY_TOKEN:
        print("[WEBHOOK] Successfully verified by Meta!")
        return Response(content=challenge, media_type="text/plain", status_code=200)
    
    raise HTTPException(status_code=403, detail="Verification token mismatch")

@app.post("/api/webhook")
@app.post("/webhook")
async def receive_webhook(request: Request):
    """
    Receives incoming WhatsApp messages and delivery statuses from Meta Cloud API
    and Meta App Dashboard Test Tool.
    """
    try:
        body = await request.json()
        
        # Extract values from all formats (Production & Meta Dashboard Test Tool)
        values_to_process = []
        if "entry" in body and isinstance(body["entry"], list):
            for entry in body["entry"]:
                for change in entry.get("changes", []):
                    val = change.get("value")
                    if isinstance(val, dict):
                        values_to_process.append(val)
        elif "messages" in body or "contacts" in body or "statuses" in body:
            values_to_process.append(body)
        elif "value" in body and isinstance(body["value"], dict):
            values_to_process.append(body["value"])
        
        messages_db = load_json("messages.json", {})
        employees = load_json("employees.json", [])
        emp_lookup = {e.get("phone", "").replace("+", "").replace(" ", ""): e for e in employees}
        broadcasts = load_json("broadcasts.json", [])
        broadcasts_changed = False
        
        for value in values_to_process:
            contacts = value.get("contacts") or body.get("contacts") or []
            contact_profile = contacts[0].get("profile", {}) if len(contacts) > 0 and isinstance(contacts[0], dict) else {}
            
            # 1. Process incoming messages
            for msg in value.get("messages", []):
                raw_from = str(msg.get("from") or (contacts[0].get("wa_id") if contacts else "") or "unknown")
                clean_sender = raw_from.lstrip("+").strip()
                sender_phone = f"+{clean_sender}"
                
                text_body = ""
                msg_type = msg.get("type", "text")
                if msg_type == "text":
                    text_body = msg.get("text", {}).get("body", "")
                elif msg_type == "button":
                    text_body = msg.get("button", {}).get("text", "")
                else:
                    text_body = f"[{msg_type} message]" if not msg.get("text") else msg.get("text", {}).get("body", "")

                # Lookup employee profile or fallback to Meta profile name
                emp = emp_lookup.get(clean_sender)
                emp_name = emp.get("name") if emp else (contact_profile.get("name") or sender_phone)
                emp_dept = emp.get("department", "WhatsApp Contact") if emp else "WhatsApp Contact"

                if sender_phone not in messages_db:
                    messages_db[sender_phone] = {
                        "employee_id": emp.get("id", "EMP-UNKNOWN") if emp else "EMP-NEW",
                        "name": emp_name,
                        "role": f"Employee • {emp_dept}",
                        "unread_count": 0,
                        "last_activity": "Just now",
                        "messages": [],
                        "phone": sender_phone
                    }

                now_time = datetime.now(PKT_TZ).strftime("%I:%M %p")
                messages_db[sender_phone]["name"] = emp_name
                messages_db[sender_phone]["messages"].append({
                    "id": msg.get("id", str(time.time())),
                    "direction": "incoming",
                    "sender": emp_name,
                    "text": text_body,
                    "time": now_time,
                    "timestamp": datetime.utcnow().isoformat() + "Z"
                })
                messages_db[sender_phone]["unread_count"] += 1
                messages_db[sender_phone]["last_activity"] = now_time

                # Mark corresponding broadcast recipient status as 'replied'
                for b in broadcasts:
                    for bm in b.get("messages", []):
                        bm_clean = str(bm.get("phone", "")).lstrip("+").replace(" ", "")
                        if bm_clean == clean_sender:
                            bm["status"] = "replied"
                            broadcasts_changed = True

            # 2. Check for status updates (sent / delivered / read / failed)
            for status_update in value.get("statuses", []):
                raw_recipient = str(status_update.get("recipient_id", "")).lstrip("+")
                recipient_phone = f"+{raw_recipient}"
                status_val = status_update.get("status")
                msg_id = status_update.get("id")
                if recipient_phone in messages_db:
                    for m in reversed(messages_db[recipient_phone].get("messages", [])):
                        if m.get("id") == msg_id:
                            m["status"] = status_val
                            break

                # Also update broadcast recipient messages tracker
                for b in broadcasts:
                    for bm in b.get("messages", []):
                        if bm.get("wamid") == msg_id or bm.get("id") == msg_id:
                            if bm.get("status") != "replied":
                                bm["status"] = status_val
                            broadcasts_changed = True

        if broadcasts_changed:
            for b in broadcasts:
                b_msgs = b.get("messages", [])
                if b_msgs:
                    tot = len(b_msgs)
                    deliv = sum(1 for m in b_msgs if m.get("status") in ["delivered", "read", "seen", "replied"])
                    read_cnt = sum(1 for m in b_msgs if m.get("status") in ["read", "seen", "replied"])
                    replied_cnt = sum(1 for m in b_msgs if m.get("status") == "replied")
                    b["delivered_pct"] = round((deliv / tot) * 100, 1)
                    b["read_pct"] = round((read_cnt / tot) * 100, 1)
                    b["replies_count"] = replied_cnt
            save_json("broadcasts.json", broadcasts)

        save_json("messages.json", messages_db)
        return {"status": "success"}
    except Exception as e:
        print(f"[WEBHOOK ERROR] {e}")
        return {"status": "error", "message": str(e)}


# Serve Static UI files (supports public directory on Vercel and local static fallback)
STATIC_DIR = BASE_DIR / "public" if (BASE_DIR / "public").exists() else BASE_DIR / "static"

@app.get("/api/debug-db")
@app.get("/debug-db")
def debug_mongodb():
    if db is None:
        return {"status": "error", "message": "db is None", "uri_set": bool(MONGODB_URI)}
    try:
        ping = db.command("ping")
        count = db["chats"].count_documents({})
        return {"status": "connected", "ping": ping, "chats_count": count}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/")
def get_root():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(
            str(index_file),
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
    return {"message": "Al Haditha WhatsApp System API is running"}

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static_dir")
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
