"""
SAFollow SMM Panel API — Official Python SDK
Standard SMM API v2 Client for SAFollow (Zero external dependencies).
"""
import urllib.request
import urllib.parse
import json
from typing import Dict, Any, List, Optional, Union

DEFAULT_API_URL = "http://localhost:3001/api/v2"

class SafollowClient:
    def __init__(self, api_key: str, api_url: str = DEFAULT_API_URL):
        if not api_key:
            raise ValueError("SAFollow API Key is required")
        self.api_key = api_key.strip()
        self.api_url = api_url.rstrip("/")

    def _request(self, action: str, params: Optional[Dict[str, Any]] = None) -> Any:
        data = {
            "key": self.api_key,
            "action": action
        }
        if params:
            data.update(params)

        encoded_data = urllib.parse.urlencode(data).encode("utf-8")
        req = urllib.request.Request(
            self.api_url,
            data=encoded_data,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "SAFollow-PythonSDK/1.0.0"
            },
            method="POST"
        )

        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode("utf-8")
            try:
                res_json = json.loads(text)
                if isinstance(res_json, dict) and "error" in res_json:
                    raise RuntimeError(f"[SAFollow API Error] {res_json['error']}")
                return res_json
            except json.JSONDecodeError:
                raise ValueError(f"Invalid JSON response from {self.api_url}: {text[:120]}")

    def get_balance(self) -> Dict[str, str]:
        """Fetch user balance and currency"""
        return self._request("balance")

    def get_services(self) -> List[Dict[str, Any]]:
        """Fetch all 1,034+ active services and pricing"""
        return self._request("services")

    def create_order(
        self, 
        service: Union[int, str], 
        link: str, 
        quantity: Union[int, str],
        runs: Optional[int] = None,
        interval: Optional[int] = None
    ) -> Dict[str, int]:
        """Create a new social media order (Instagram, Facebook, YouTube, TikTok)"""
        params = {
            "service": str(service),
            "link": str(link).strip(),
            "quantity": str(quantity)
        }
        if runs is not None:
            params["runs"] = str(runs)
        if interval is not None:
            params["interval"] = str(interval)
        return self._request("add", params)

    def get_status(self, order_id: Union[int, str]) -> Dict[str, Any]:
        """Get live fulfillment status for an order"""
        return self._request("status", {"order": str(order_id)})

    def get_multiple_statuses(self, order_ids: List[Union[int, str]]) -> Dict[str, Any]:
        """Batch query up to 100 order statuses"""
        return self._request("status", {"orders": ",".join(str(x) for x in order_ids)})

    def request_refill(self, order_id: Union[int, str]) -> Dict[str, int]:
        """Request free warranty refill for dropped followers/views"""
        return self._request("refill", {"order": str(order_id)})

    def get_refill_status(self, refill_id: Union[int, str]) -> Dict[str, str]:
        """Get status of a refill request"""
        return self._request("refill_status", {"refill": str(refill_id)})
