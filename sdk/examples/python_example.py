"""
SAFollow Official Python SDK Example
Run: python3 sdk/examples/python_example.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python"))
from safollow_smm import SafollowClient

API_KEY = os.environ.get("SAFOLLOW_API_KEY", "saf_demo_81ec54680f0f703d451edd38285617b4")
API_URL = os.environ.get("SAFOLLOW_API_URL", "http://localhost:3001/api/v2")

def main():
    print("🚀 Initializing SAFollow Python SDK...")
    client = SafollowClient(API_KEY, API_URL)

    try:
        # 1. Check Balance
        print("\n1. Fetching Account Balance:")
        balance = client.get_balance()
        print(f"   Balance: ${balance['balance']} {balance['currency']}")

        # 2. Fetch Services
        print("\n2. Fetching Services Catalog:")
        services = client.get_services()
        print(f"   Total Services: {len(services)}")

        # 3. Place Order
        print("\n3. Placing Order via Python SDK:")
        order = client.create_order(
            service=1925,
            link="https://www.instagram.com/fsferdows/",
            quantity=100
        )
        print(f"   ✅ Order Created: #{order['order']}")

        # 4. Check Status
        print("\n4. Checking Order Status:")
        status = client.get_status(order["order"])
        print(f"   Status: [{status['status']}] | Remains: {status['remains']} | Charge: ${status['charge']}")

        print("\n✨ Python SDK verified successfully!")
    except Exception as exc:
        print(f"❌ Python SDK Error: {exc}")

if __name__ == "__main__":
    main()
