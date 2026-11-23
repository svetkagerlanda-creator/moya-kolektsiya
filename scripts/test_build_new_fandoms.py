#!/usr/bin/env python3
"""Regression checks for manually verified product identifiers across refreshes."""
import unittest
from build_new_fandoms import preserve_curated_fields

class PreserveCuratedProductFields(unittest.TestCase):
    def test_preserves_barcodes_and_provenance_when_crawl_lacks_them(self):
        old = {
            "name": "Original doll",
            "sourceUrl": "https://example.org/doll",
            "figureNumber": "HXH76",
            "photo": "https://example.org/real-photo.png",
            "upc": "889698906395",
            "ean": "0194735230648",
            "barcodeType": "EAN-13",
            "barcodeSourceUrl": "https://example.org/upc",
            "barcodeVerification": "Checked original retail package",
            "barcodeNote": "Assortment code, not a chase variant",
        }
        crawled = {
            "name": "Original doll",
            "sourceUrl": "https://example.org/doll",
            "photo": "",
            "figureNumber": "",
            "description": "Newly verified description",
        }
        result = preserve_curated_fields(crawled, old)
        for key in ("upc", "ean", "barcodeType", "barcodeSourceUrl",
                    "barcodeVerification", "barcodeNote", "photo", "figureNumber"):
            self.assertEqual(result[key], old[key])
        self.assertEqual(result["description"], "Newly verified description")
        self.assertEqual(old.get("description"), None)

    def test_new_nonempty_barcode_from_source_can_update_old_barcode(self):
        old = {"upc": "889698906395", "barcodeSourceUrl": "https://example.org/old"}
        crawled = {"upc": "889698906401", "barcodeSourceUrl": "https://example.org/new"}
        result = preserve_curated_fields(crawled, old)
        self.assertEqual(result["upc"], "889698906401")
        self.assertEqual(result["barcodeSourceUrl"], "https://example.org/new")

    def test_empty_crawled_values_cannot_erase_metadata(self):
        old = {"upc": "889698906395", "barcodeType": "UPC-A",
               "barcodeSourceUrl": "https://example.org/product"}
        result = preserve_curated_fields(
            {"upc": "", "barcodeType": None, "barcodeSourceUrl": ""}, old)
        self.assertEqual(result, old)

    def test_preserves_variant_identity_while_updating_product_description(self):
        old = {"variantKey": "123|456", "name": "Bratz — Jade",
               "upc": "035051565017", "barcodeNote": "Jade"}
        fresh = {"variantKey": "123|456", "name": "Bratz — Jade",
                 "description": "Verified new retailer copy", "upc": ""}
        result = preserve_curated_fields(fresh, old)
        self.assertEqual(result["variantKey"], "123|456")
        self.assertEqual(result["upc"], "035051565017")
        self.assertEqual(result["description"], "Verified new retailer copy")

if __name__ == "__main__":
    unittest.main()
