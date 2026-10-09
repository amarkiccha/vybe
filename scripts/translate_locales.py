"""Dev tool: generate locale dictionaries from en.json (keys preserved). Review by native speakers before release."""
import asyncio, json, os, sys, re
from emergentintegrations.llm.chat import LlmChat, UserMessage
SRC = "/app/frontend/src/locales/en.json"
NAMES = {"kn": "Kannada", "hi": "Hindi", "te": "Telugu", "ta": "Tamil", "ml": "Malayalam", "mr": "Marathi", "bn": "Bengali"}
def flat(d, p=""):
    out = {}
    for k, v in d.items():
        if isinstance(v, dict): out.update(flat(v, p + k + "."))
        else: out[p + k] = v
    return out
def unflat(f):
    r = {}
    for k, v in f.items():
        cur = r; parts = k.split(".")
        for x in parts[:-1]: cur = cur.setdefault(x, {})
        cur[parts[-1]] = v
    return r
async def one(code, en):
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"tr-{code}", system_message="You are a professional mobile app localizer for Indian languages.").with_model("openai", "gpt-4.1")
    prompt = (f"Translate the JSON values into natural, concise {NAMES[code]} for a messaging app UI named VYBE. Keep keys identical, keep {{{{placeholders}}}} exactly, keep 'VYBE', emoji, URLs, CSV header words (name,phone,email,tags,consent) and \\n unchanged. Return ONLY JSON.\n" + json.dumps(en, ensure_ascii=False))
    txt = await chat.send_message(UserMessage(text=prompt))
    txt = re.sub(r"^```(json)?|```$", "", txt.strip(), flags=re.M).strip()
    tr = json.loads(txt)
    merged = {k: (tr.get(k) if isinstance(tr.get(k), str) and tr.get(k).strip() else v) for k, v in en.items()}
    json.dump(unflat(merged), open(f"/app/frontend/src/locales/{code}.json", "w"), ensure_ascii=False, indent=1)
    print(code, "ok", sum(1 for k in en if tr.get(k)), "/", len(en))
async def main():
    en = flat(json.load(open(SRC)))
    codes = sys.argv[1:] or list(NAMES)
    await asyncio.gather(*(one(c, en) for c in codes))
asyncio.run(main())
