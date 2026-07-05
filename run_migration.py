"""Run schema_new.sql against Supabase project using psycopg2 connection pooler."""
import os
import sys

# Load .env
from dotenv import load_dotenv
load_dotenv()

supabase_url = os.getenv("SUPABASE_URL", "")
service_key = os.getenv("SUPABASE_SERVICE_KEY", "")

if not supabase_url or not service_key:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
    sys.exit(1)

# Extract project ref from URL
# URL format: https://<ref>.supabase.co
project_ref = supabase_url.replace("https://", "").split(".")[0]
print(f"Project ref: {project_ref}")

# Connection string using Supabase connection pooler (transaction mode, port 6543)
# Region is likely ap-south-1 for Indian users
regions = [
    "aws-0-ap-south-1.pooler.supabase.com",
    "aws-0-ap-southeast-1.pooler.supabase.com",
    "aws-0-us-east-1.pooler.supabase.com",
    "aws-0-eu-west-1.pooler.supabase.com",
    "db.ojmncjuzpuukooinncou.supabase.co",
]

user = f"postgres.{project_ref}"
dbname = "postgres"

import psycopg2

# Read SQL files
script_dir = os.path.dirname(os.path.abspath(__file__))

sql_files = ["schema_new.sql", "migration_billing.sql"]
sql_parts = []
for fname in sql_files:
    fpath = os.path.join(script_dir, fname)
    if os.path.exists(fpath):
        with open(fpath, "r", encoding="utf-8") as f:
            content = f.read()
            sql_parts.append(content)
            print(f"Read {len(content)} bytes from {fname}")
    else:
        print(f"Skipping {fname} — not found")

sql = "\n\n-- === next migration ===\n\n".join(sql_parts)

last_err = None
for host in regions:
    port = 6543 if "pooler" in host else 5432
    sslmode = "require"
    try:
        print(f"\nTrying {host}:{port} ...")
        conn = psycopg2.connect(
            host=host,
            port=port,
            user=user,
            password=service_key,
            dbname=dbname,
            sslmode=sslmode,
            connect_timeout=10,
        )
        conn.autocommit = True
        cur = conn.cursor()
        print("Connected! Executing migration...")
        cur.execute(sql)
        print("Migration completed successfully!")
        cur.close()
        conn.close()
        sys.exit(0)
    except Exception as e:
        last_err = e
        print(f"  Failed: {e}")
        continue

print(f"\nAll connection attempts failed. Last error: {last_err}")
sys.exit(1)
