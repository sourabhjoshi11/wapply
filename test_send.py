import sys
sys.path.insert(0, '.')
import asyncio
import httpx
from app.database import supabase

async def main():
    # Fetch shop credentials from database
    result = supabase.table("shops").select("*").single().execute()
    shop = result.data
    
    access_token = shop["access_token"]
    phone_number_id = shop["phone_number_id"]
    to_number = "916266287021"
    
    url = f"https://graph.facebook.com/v22.0/{phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to_number,
        "type": "text",
        "text": {"body": "Test message from backend manually"},
    }
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=headers, json=payload)
        print("Status Code:", response.status_code)
        print("Response Text:", response.text)

if __name__ == "__main__":
    asyncio.run(main())
