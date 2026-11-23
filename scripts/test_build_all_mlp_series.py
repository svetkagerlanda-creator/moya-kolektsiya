#!/usr/bin/env python3
"""Offline regression tests for MLP Merch importers.

These fixtures intentionally require no live requests; the full refresh job
remains responsible for checking the actual upstream pages.
"""
import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/"scripts"/"build_all_mlp_series.py"
spec=importlib.util.spec_from_file_location("mlp_all",SOURCE)
mlp=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mlp)

class MlpMerchImporterTests(unittest.TestCase):
    def test_seven_corrected_database_routes(self):
        expected={
            "g1-plush":("series","G1 Plush"),
            "g3-plush":("series","G3 Plush"),
            "hasbro-pop":("type","Hasbro POP"),
            "basic-fun":("series","Basic Fun"),
            "ep":("type","Enterplay"),
            "g5-blind-bags":("release","G5 Blind Bags"),
            "fairy-tails":("set","Fairy Tails"),
        }
        actual={root:(group,label) for root,label,group in mlp.DATABASES}
        for root,route in expected.items():
            with self.subTest(root=root):
                self.assertEqual(actual[root],route)

    def test_singular_and_plural_source_count(self):
        for suffix in ("figure","figures","comic","comics","release","releases"):
            with self.subTest(suffix=suffix):
                self.assertIsNotNone(mlp.COUNT_RE.search("(2 "+suffix+")"))
                self.assertIsNotNone(mlp.TOTAL_RE.search("with a total of 2 "+suffix))

    def test_comics_use_issue_cards_without_detail_links(self):
        page=BeautifulSoup("""
          <main><p>with a total of 2 releases</p>
            <div class="data-item">
              <div class="data-top"><img class="data-img" src="https://img.example/one.jpg"/></div>
              <div class="data-bottom">
                <div class="data-name">Friendship is Magic Issue #1 The Return of Queen Chrysalis W: Katie Cook</div>
                <p>W: Katie Cook</p>
              </div>
            </div>
            <div class="data-item">
              <div class="data-top"><img class="data-img" data-src="https://img.example/two.jpg"/></div>
              <div class="data-bottom"><div class="data-name">Friendship is Magic Issue #2</div></div>
            </div>
          </main>
        ""","html.parser")
        entry={"source":"https://data.mlpmerch.com/comics/series/friendship-is-magic/",
               "name":"MLP Merch · G4 Comics · Friendship is Magic",
               "root":"comics","expected":2,"manufacturer":""}
        with patch.object(mlp,"soup_at",return_value=page):
            result=mlp.parse(entry)
        self.assertEqual(result["count"],2)
        self.assertEqual(result["completeness"],"verified-full-series")
        self.assertEqual([x["name"] for x in result["items"]],
                         ["Friendship is Magic Issue #1","Friendship is Magic Issue #2"])
        self.assertEqual(len({x["variantKey"] for x in result["items"]}),2)
        self.assertEqual(len({x["photo"] for x in result["items"]}),2)
        self.assertTrue(all(x["sourceUrl"]==entry["source"] for x in result["items"]))

    def test_missing_count_is_partial_not_imaginary_complete(self):
        page=BeautifulSoup("""
         <div class="data-item">
          <div class="data-top"><img src="https://img.example/one.jpg"/></div>
          <div class="data-bottom"><b class="data-name">Issue #1</b></div>
         </div>
        ""","html.parser")
        entry={"source":"https://data.mlpmerch.com/g5-comics/series/my-little-pony/",
               "name":"G5 Comics","root":"g5-comics","expected":None,"manufacturer":""}
        with patch.object(mlp,"soup_at",return_value=page):
            result=mlp.parse(entry)
        self.assertEqual(result["count"],1)
        self.assertEqual(result["completeness"],"verified-selected-releases")
        self.assertIsNone(result["sourceDeclaredCount"])

    def test_rejects_mismatched_declared_release_count(self):
        page=BeautifulSoup("""
         <p>with a total of 3 releases</p>
         <div class="data-item"><div class="data-top"><img src="https://img.example/one.jpg"/></div>
         <div class="data-bottom"><b class="data-name">Issue #1</b></div></div>
        ""","html.parser")
        entry={"source":"https://data.mlpmerch.com/comics/series/test/",
               "name":"Test","root":"comics","expected":3,"manufacturer":""}
        with patch.object(mlp,"soup_at",return_value=page):
            with self.assertRaisesRegex(ValueError,"expected 3, extracted 1"):
                mlp.parse(entry)

if __name__=="__main__":
    unittest.main()
