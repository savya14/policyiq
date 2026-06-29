#!/usr/bin/env python3
"""
Run the Category 3 verification tests against the PolicyIQ backend.
Runs one query at a time with a 5s pause between tests to spread token usage.
"""
import json
import time
import urllib.request
import urllib.error

ENDPOINT = "http://localhost:8000/ask"
PAUSE_BETWEEN_TESTS = 5  # seconds

TESTS = [
    {
        "num": 1,
        "query": "What's the difference between PESO and OISD requirements for LPG cylinder storage?",
        "session_id": "eval-t1",
        "check_notes": "Should surface PESO 3.0m figure AND OISD capacity-based distances. Must not claim PESO info absent when it's in context."
    },
    {
        "num": 2,
        "query": "What is the safe distance for an LPG vessel with exactly 20 Cu. Mt. capacity — does it fall under the 15m or 20m category?",
        "session_id": "eval-t2",
        "check_notes": "Must open with direct resolution: 20 Cu.Mt. falls at UPPER boundary of 10-20 bracket. Must say '15m' as the answer explicitly."
    },
    {
        "num": 3,
        "query": "What are the fire hydrant inspection intervals per OISD-141?",
        "session_id": "eval-t3",
        "check_notes": "OISD-141 not indexed. Must state absence ONCE, then offer OISD-144/OISD-116 related info naturally."
    },
    {
        "num": 4,
        "query": "If PESO Gas Cylinders Rules and OISD-STD-144 specify different safety distances for LPG cylinder storage, which takes precedence?",
        "session_id": "eval-t4",
        "check_notes": "Surface both documents' figures. Honestly note precedence is outside document scope. Do NOT fabricate ranking."
    },
    {
        "num": 5,
        "query": "What is the safe distance for CNG storage near a process unit?",
        "session_id": "eval-t5",
        "check_notes": "CNG != LPG. Must NOT substitute LPG figures. Should say CNG is not covered."
    },
    {
        "num": 6,
        "query": "What does OISD-STD-150 say about LPG bottling plant fire protection?",
        "session_id": "eval-t6",
        "check_notes": "STD-150 = mounded storage, not bottling. Must correct conflation. Redirect to GDN-169 if available."
    },
    {
        "num": 7,
        "query": "What is the minimum safe distance for storage?",
        "session_id": "eval-t7",
        "check_notes": "Ambiguous query. Must ask clarifying question or present 2-3 category options. Must NOT pick one substance definitively."
    },
    {
        "num": 8,
        "query": "What are the safety requirements for LPG bulk storage installations?",
        "session_id": "eval-t8",
        "check_notes": "Dedup check: confirm no duplicate filenames in source_documents list."
    },
]


def run_query(query: str, session_id: str) -> dict:
    payload = json.dumps({"question": query, "session_id": session_id}).encode("utf-8")
    req = urllib.request.Request(
        ENDPOINT,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        return {"error": f"HTTP {e.code}: {body}", "answer": "[REQUEST FAILED]", "source_documents": []}
    except urllib.error.URLError as e:
        return {"error": str(e), "answer": "[REQUEST FAILED]", "source_documents": []}


def main():
    print("\n" + "=" * 70)
    print(" PolicyIQ — Category 3 Verification Tests")
    print("=" * 70)

    results = []

    for i, test in enumerate(TESTS):
        print(f"\n{'─' * 70}")
        print(f"TEST {test['num']}: {test['query']}")
        print(f"Check: {test['check_notes']}")
        print(f"{'─' * 70}")

        result = run_query(test["query"], test["session_id"])

        if "error" in result and result["answer"] == "[REQUEST FAILED]":
            print(f"❌ REQUEST ERROR: {result['error']}")
            results.append({"num": test["num"], "status": "ERROR", "error": result["error"]})
            # If rate limited, stop and report
            if "429" in str(result["error"]):
                print("\n⚠️  RATE LIMIT HIT — stopping to preserve quota for manual testing")
                break
            continue

        answer = result.get("answer", "[no answer]")
        sources = result.get("source_documents", [])
        in_scope = result.get("is_in_scope", True)

        print(f"\nANSWER:\n{answer}")
        print(f"\nSOURCES ({len(sources)} cards):")
        seen_sources = []
        dup_sources = []
        for s in sources:
            src_str = f"  - {s['source']} (pg {s.get('page_number', '?')})"
            if s['source'] in seen_sources:
                print(f"  ⚠️  DUPLICATE FILENAME: {src_str}")
                dup_sources.append(s['source'])
            else:
                seen_sources.append(s['source'])
                print(src_str)

        print(f"\nIn scope: {in_scope}")

        # Quick pass/fail checks
        checks = {}
        if test["num"] == 2:
            checks["leads_with_direct_answer"] = "15m" in answer or "15 m" in answer
        if test["num"] == 3:
            checks["no_repeat_disclaimer"] = answer.lower().count("not indexed") + answer.lower().count("not covered") <= 1
        if test["num"] == 5:
            checks["no_CNG_LPG_conflation"] = "CNG" in answer and ("not covered" in answer.lower() or "not indexed" in answer.lower() or "not available" in answer.lower() or "LPG" in answer)
        checks["no_duplicate_sources"] = len(dup_sources) == 0

        if checks:
            print(f"\nAuto-checks:")
            for k, v in checks.items():
                icon = "✅" if v else "❌"
                print(f"  {icon} {k}")

        results.append({"num": test["num"], "status": "OK", "has_dups": len(dup_sources) > 0})

        # Pause between tests to spread token usage
        if i < len(TESTS) - 1:
            print(f"\n  [Pausing {PAUSE_BETWEEN_TESTS}s before next test...]")
            time.sleep(PAUSE_BETWEEN_TESTS)

    print("\n" + "=" * 70)
    print(" SUMMARY")
    print("=" * 70)
    for r in results:
        if r["status"] == "ERROR":
            print(f"  TEST {r['num']}: ❌ ERROR")
        elif r.get("has_dups"):
            print(f"  TEST {r['num']}: ⚠️  OK (duplicate source filenames detected)")
        else:
            print(f"  TEST {r['num']}: ✅ OK")
    print()


if __name__ == "__main__":
    main()
