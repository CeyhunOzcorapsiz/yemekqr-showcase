import asyncio
import importlib.util
import json
import os
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4
import httpx
from PIL import Image

os.environ["ML_MODE"] = "mock"
os.environ["ML_SERVICE_TOKEN"] = "test-service-token"
spec = importlib.util.spec_from_file_location("yemekqr_ml", Path(__file__).parents[1] / "main.py")
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)

def png():
    out = BytesIO()
    Image.new("RGB", (16, 16), "white").save(out, format="PNG")
    return out.getvalue()

class ServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=service.app), base_url="http://test", headers={"X-Service-Token": "test-service-token"})
        self.label = {"id": str(uuid4()), "name": "Pilav"}

    async def asyncTearDown(self):
        await self.client.aclose()

    async def send(self, image=None, labels=None):
        return await self.client.post("/detect", files={"image": ("plate.png", png() if image is None else image, "image/png")}, data={"labels": json.dumps([self.label] if labels is None else labels)})

    async def test_mock_is_explicit_and_returns_valid_ids(self):
        response = await self.send()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["mode"], "mock")
        self.assertEqual(response.json()["detections"][0]["id"], self.label["id"])

    async def test_body_limit_before_multipart_parsing(self):
        response = await self.client.post("/detect", content=b"x", headers={"content-length":str(10*1024*1024), "content-type":"multipart/form-data; boundary=x"})
        self.assertEqual(response.status_code,413)

    async def test_service_auth(self):
        response = await self.client.get("/health", headers={"X-Service-Token": "wrong"})
        self.assertEqual(response.status_code, 401)

    async def test_bad_image_and_labels(self):
        self.assertEqual((await self.send(image=b"invalid")).status_code, 400)
        self.assertEqual((await self.send(labels=[])).status_code, 400)
        self.assertEqual((await self.send(labels=[self.label,self.label])).status_code, 400)

    async def test_oversize_image(self):
        self.assertEqual((await self.send(image=b"x"*(8*1024*1024+1))).status_code, 413)

    async def test_model_response_constraints(self):
        labels=[service.Label(**self.label)]
        for raw in [[{"id":self.label["id"],"confidence":2}], [{"id":str(uuid4()),"confidence":.8}], [{"id":self.label["id"],"confidence":.8}]*2, [{"id":self.label["id"],"confidence":float("nan")}], {"not":"list"}]:
            with self.assertRaises(service.HTTPException):
                service.parse_detections(raw,labels)

    async def test_waiting_inference_does_not_block_health(self):
        entered=asyncio.Event()
        release=asyncio.Event()
        async def inference(*args):
            entered.set()
            await release.wait()
            return [service.Detection(id=self.label["id"],confidence=.8)]
        with patch.object(service,"MODE","gemini"),patch.object(service,"KEY","test"),patch.object(service,"run_inference_gemini",inference):
            task=asyncio.create_task(self.send())
            await asyncio.wait_for(entered.wait(),1)
            try:
                response=await asyncio.wait_for(self.client.get("/health"),.5)
                self.assertEqual(response.status_code,200)
            finally:
                release.set()
                await task

    async def test_missing_key_is_not_silent_mock(self):
        with patch.object(service,"MODE","gemini"),patch.object(service,"KEY",""):
            self.assertEqual((await self.send()).status_code,503)

    async def test_capacity_limit(self):
        with patch.object(service,"active",service.MAX_CONCURRENT):
            self.assertEqual((await self.send()).status_code,429)

if __name__ == "__main__":
    unittest.main()
