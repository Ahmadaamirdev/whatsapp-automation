# Al-Haditha Energy - WhatsApp Announcement & Live Chat System

Enterprise WhatsApp communication system built for **Al-Haditha Energy**, powered by the **Meta WhatsApp Business Cloud API**.

## Features

1. **Dashboard & KPIs**:
   - Total Employees: 1,500
   - Broadcast counter & overall delivery rate (98.2%)
   - Delivery Analytics chart (Delivered, Read, Replied)
2. **Bulk Announcement Broadcasts**:
   - Use pre-approved Meta WhatsApp templates (Utility / Marketing)
   - Dynamic template variables (`{{1}}`, `{{2}}`, etc.) to change the announcement text on the fly
   - Recipient targeting: All Employees (1,500), By Department, By Location, or Custom List
3. **Live Chat & Two-Way Conversations**:
   - Real-time conversation threads with employees
   - Outgoing replies and incoming employee messages
   - Search employees by name, phone, or ID
4. **Meta Template Management (Direct API)**:
   - View live templates and approval status (APPROVED / PENDING / REJECTED)
   - Submit new templates directly to Meta Cloud API from within the app
5. **Employee Directory**:
   - Searchable, paginated directory of 1,500 employees across departments and site locations
6. **Meta Webhook Support**:
   - Ready-to-verify endpoint (`/api/webhook`) for Meta's automated verification challenge and live incoming message events.

---

## Local Setup & Testing

1. Ensure requirements are installed:
   ```bash
   pip install -r requirements.txt
   ```
2. Start the application:
   ```bash
   python main.py
   ```
3. Open your browser at:
   ```
   http://localhost:8000
   ```

---

## Deploying to Vercel

1. Push this folder to a GitHub repository, or install the Vercel CLI (`npm i -g vercel`).
2. In Vercel, import the project.
3. In **Settings > Environment Variables**, add:
   - `META_APP_ID`: `2049923772374313`
   - `META_APP_SECRET`: `18d803ccb0bcffc61a250dde640ecbb2`
   - `WHATSAPP_PHONE_NUMBER_ID`: `1451021148100534`
   - `WHATSAPP_BUSINESS_ACCOUNT_ID`: `1153445740531196`
   - `WHATSAPP_ACCESS_TOKEN`: *(Your permanent token)*
   - `WEBHOOK_VERIFY_TOKEN`: `alhaditha_wa_webhook_verify_2026`
4. Click **Deploy**.

---

## Setting Up Meta Webhook After Deployment

Once deployed to Vercel:
1. In Meta Developers Portal, go to **WhatsApp > Configuration / Step 2. Production setup**.
2. Click **Edit** under **Configure Webhooks**:
   - **Callback URL**: `https://your-deployment-name.vercel.app/api/webhook`
   - **Verify token**: `alhaditha_wa_webhook_verify_2026`
3. Click **Verify and save** (Meta will verify it immediately with HTTP 200).
4. Under Webhook fields, click **Manage** and subscribe to **messages**.
