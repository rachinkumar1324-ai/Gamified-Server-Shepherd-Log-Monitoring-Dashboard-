
import time
import requests
import os

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000/ingest")
LOG_FILE = "access.log"
SLEEP = 0.5

def tail(f):
    f.seek(0, os.SEEK_END)
    while True:
        line = f.readline()
        if not line:
            time.sleep(SLEEP)
            continue
        yield line

def send_line(line):
    try:
        resp = requests.post(BACKEND_URL, json={"line": line.strip()}, timeout=2)
        if resp.status_code != 200:
            print("Failed to send:", resp.status_code, resp.text)
    except Exception as e:
        print("Error sending to backend:", e)

def main():
    if not os.path.exists(LOG_FILE):
        print(f"{LOG_FILE} not found. Creating a sample one...")
        with open(LOG_FILE, "w") as f:
            # create sample lines
            f.write('127.0.0.1 - - [09/Nov/2025:10:00:00 +0000] "GET /index.html HTTP/1.1" 200 612 "-" "curl/7.68.0"\n')
            f.write('127.0.0.1 - - [09/Nov/2025:10:00:02 +0000] "GET /api/data HTTP/1.1" 500 234 "-" "curl/7.68.0"\n')
    print("Tailing", LOG_FILE, "and sending to", BACKEND_URL)
    with open(LOG_FILE, "r") as f:
        for line in tail(f):
            print("->", line.strip())
            send_line(line)

if __name__ == "__main__":
    main()
