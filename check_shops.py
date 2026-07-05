import sys; sys.path.insert(0, '.')
from supabase import create_client
from app.config import settings
c = create_client(settings.supabase_url, settings.supabase_service_key)
r = c.table('shops').select('*').execute()
print('Count:', len(r.data))
for shop in r.data:
    for k, v in shop.items():
        if k == 'access_token':
            display = v[:20] + '...' if v else '(empty)'
            print(f'  {k}: {display}')
        elif k == 'google_sheet_id':
            display = v[:20] + '...' if v else '(empty)'
            print(f'  {k}: {display}')
        else:
            print(f'  {k}: {v}')
    print('---')
