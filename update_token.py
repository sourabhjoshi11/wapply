import sys
sys.path.insert(0, '.')
from app.database import supabase

def update_token(new_token: str):
    new_token = new_token.strip()
    if not new_token:
        print("Error: Access token cannot be empty.")
        return
        
    try:
        # Update the token in Supabase
        result = (
            supabase.table("shops")
            .update({"access_token": new_token})
            .eq("phone_number_id", "1244240165431529")
            .execute()
        )
        if result.data:
            print("🎉 Success! Access Token updated in the database for the shop.")
            print(f"Shop Name: {result.data[0]['name']}")
            print(f"New Token prefix: {result.data[0]['access_token'][:30]}...")
        else:
            print("⚠️ Warning: No shop found with phone_number_id '1244240165431529'.")
    except Exception as e:
        print("❌ Error updating token in database:", str(e))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python update_token.py <your_new_access_token>")
    else:
        update_token(sys.argv[1])
