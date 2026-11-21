import uvicorn

if __name__ == "__main__":
    print("=" * 60)
    print("Starting Al-Haditha WhatsApp Announcement System...")
    print("Open your browser at: http://localhost:8000")
    print("=" * 60)
    uvicorn.run("api.index:app", host="127.0.0.1", port=8000, reload=True)
