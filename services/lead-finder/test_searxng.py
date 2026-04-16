#!/usr/bin/env python3
"""Test SearXNG search locally or on server."""

import sys
import argparse
import httpx

def test_search(query, limit=5):
    base_url = "http://localhost:8080" if "--local" in sys.argv else "http://searxng:8080"
    
    try:
        r = httpx.get(f"{base_url}/search", params={
            "q": query,
            "format": "json",
            "limit": limit
        }, timeout=15)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print(f"Błąd połączenia: {e}")
        print(f"Upewnij się że SearXNG działa na {base_url}")
        return
    
    results = data.get("results", [])
    if not results:
        print("Brak wyników")
        return
    
    print(f"\n🔍 Zapytanie: {query}")
    print(f"📊 Wyników: {len(results)}")
    print("\n" + "="*60)
    
    for i, res in enumerate(results, 1):
        title = res.get("title", "bez tytułu")[:60]
        url = res.get("url", "")
        content = res.get("content", "")[:150].replace("\n", " ")
        
        print(f"\n{i}. {title}")
        print(f"   🔗 {url}")
        if content:
            print(f"   💬 {content}...")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test SearXNG search")
    parser.add_argument("query", nargs="?", default='"DJ wesele" Warszawa kontakt')
    parser.add_argument("-n", "--limit", type=int, default=5)
    parser.add_argument("--local", action="store_true", help="Use localhost instead of searxng")
    
    args = parser.parse_args()
    test_search(args.query, args.limit)
