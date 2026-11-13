"""Unit test cho module doc CSV Silver Source va Flask API /api/silver-source/load."""

import csv
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import app  # noqa: E402
from silver_source import load_silver_bundle, parse_request_ids, scan_silver_folder  # noqa: E402


class SilverSourceTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.req_path = os.path.join(self.tmpdir.name, "3_YeuCauSource.csv")
        self.cov_path = os.path.join(self.tmpdir.name, "3_DoiChieuDoBaoPhu.csv")

        with open(self.req_path, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.writer(f)
            writer.writerow([
                "request_id", "timeline_refs", "loi_thoai_lien_quan", "ma_loai_source",
                "noi_dung_can_thay", "nhan_vat", "doi_bong", "thoi_diem_lich_su",
                "tran_dau_hoac_su_kien", "muc_chinh_xac", "dieu_kien_bat_buoc",
                "phuong_an_thay_the", "khong_chap_nhan", "nhu_cau_thoi_luong",
                "tu_khoa_tim_kiem", "muc_uu_tien", "thong_tin_can_lam_ro",
            ])
            writer.writerow([
                "SR_001",
                "doan=1/cau=1/y=1 (TL dòng 2)\ndoan=1/cau=2 (TL dòng 4)",
                "TL dòng 2: Euro 2008,\nTL dòng 4: Tây Ban Nha vô địch.",
                "rai_2",
                "Thấy Xavi tại Euro 2008.",
                "Xavi Hernández",
                "Tây Ban Nha",
                "Euro 2008",
                "Euro 2008",
                "Đúng giải và nhân vật",
                "Thấy rõ Xavi và cúp",
                "Ảnh tư liệu cùng giải",
                "Áo Barça, kỳ Euro khác",
                "Đủ 2 cảnh",
                "Xavi Spain Euro 2008 | Xavi Eurocopa 2008",
                "Cao",
                "Kiểm tra bản quyền.",
            ])
            writer.writerow([
                "SR_008",
                "doan=3/cau=2 (TL dòng 12)",
                "TL dòng 12: Giúp Barça kiểm soát bóng.",
                "rai_1_3",
                "Busquets xử lý bóng ở Barça.",
                "Sergio Busquets",
                "Barcelona",
                "2008-2012",
                "La Liga / UCL",
                "Đúng giai đoạn",
                "Thấy Busquets nhận bóng",
                "Highlight chung",
                "Clip sau 2015",
                "1 cảnh",
                "Busquets Barcelona 2008 2012",
                "Vừa nếu duyệt",
                "",
            ])

        with open(self.cov_path, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.writer(f)
            writer.writerow([
                "dong_timeline_csv", "dong_phan_loai_csv", "doan", "cau", "y",
                "start_timeline", "moc_start_ke_tiep", "loi_thoai",
                "analysis_status_buoc_2", "ma_loai_source", "request_ids",
                "trang_thai_buoc_3", "ghi_chu", "reason_buoc_2",
            ])
            writer.writerow([
                "2", "2", "1", "1", "1",
                "00:00:00:05", "00:00:01:12", "Euro 2008,",
                "complete", "rai_2", "SR_001",
                "Có yêu cầu Silver", "SR_001: bối cảnh", "Mở mốc Euro 2008",
            ])
            writer.writerow([
                "12", "12", "3", "2", "2.1",
                "00:00:22:00", "00:00:25:10", "giúp Barça kiểm soát.",
                "manual", "rai_1_3", "SR_001 | SR_008",
                "Đề xuất yêu cầu Silver, chờ duyệt", "Cần duyệt đề xuất", "Chưa có nguồn cụ thể",
            ])

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_parse_request_ids(self):
        self.assertEqual(parse_request_ids("SR_008 | SR_009 | SR_008"), ["SR_008", "SR_009"])
        self.assertEqual(parse_request_ids("SR_001, SR_002"), ["SR_001", "SR_002"])
        self.assertEqual(parse_request_ids(""), [])

    def test_scan_silver_folder_and_load_bundle(self):
        found = scan_silver_folder(self.tmpdir.name)
        self.assertEqual(found["req_path"], self.req_path)
        self.assertEqual(found["cov_path"], self.cov_path)

        bundle = load_silver_bundle(folder_path=self.tmpdir.name)
        self.assertTrue(bundle["success"])
        self.assertEqual(len(bundle["requests"]), 2)
        self.assertEqual(len(bundle["coverage"]), 2)
        self.assertEqual(bundle["requests"][0]["linked_coverage_count"], 2)
        self.assertEqual(bundle["requests"][1]["linked_coverage_count"], 1)
        self.assertEqual(bundle["coverage"][1]["linked_request_ids"], ["SR_001", "SR_008"])
        self.assertIn("Euro 2008,", bundle["coverage"][0]["loi_thoai"])
        self.assertEqual(bundle["stats"]["by_priority"]["Cao"], 1)
        self.assertEqual(bundle["stats"]["doan_list"], ["1", "3"])

    def test_load_missing_file_raises(self):
        with self.assertRaises(FileNotFoundError):
            load_silver_bundle(req_csv=os.path.join(self.tmpdir.name, "missing.csv"))

    def test_api_silver_source_load_endpoint(self):
        client = app.test_client()
        res = client.post("/api/silver-source/load", json={"folder_path": self.tmpdir.name})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["stats"]["total_requests"], 2)
        self.assertEqual(data["stats"]["total_coverage"], 2)

        bad = client.post("/api/silver-source/load", json={})
        self.assertEqual(bad.status_code, 400)
        self.assertIn("error", bad.get_json())


if __name__ == "__main__":
    unittest.main()
