"""Compile attested Unicode hieroglyphic *word* completions, not fabricated spellings.

Input: Thesaurus Linguae Aegyptiae Earlier Egyptian Original v18 premium,
https://huggingface.co/datasets/thesaurus-linguae-aegyptiae/tla-Earlier_Egyptian_original-v18-premium
License: CC BY-SA 4.0. Each TLA sentence separates word forms by spaces.
This is a *fallback Earlier Egyptian* lexicon until the user's late-era MDWNFR
SQLite lexicon is exported; source IDs/periods must never be mislabelled.
"""
import collections
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
TARGET=ROOT/'web/assets/dictionaries/egyptian-wordforms.json'
MIN_SIGN=0x13000
MAX_SIGN=0x1342F

def valid(token):
    if not token or len(token)>72:
        return False
    chars=list(token)
    signs=sum(MIN_SIGN<=ord(ch)<=MAX_SIGN for ch in chars)
    return signs>0 and all(MIN_SIGN<=ord(ch)<=0x1345F for ch in chars)

def main(source):
    counts=collections.Counter()
    lemma={}
    sentences=0
    for line in Path(source).read_text(encoding='utf-8-sig').splitlines():
        if not line.strip():
            continue
        item=json.loads(line)
        words=item.get('hieroglyphs','').split()
        lemmas=item.get('lemmatization','').split()
        sentences+=1
        for i,word in enumerate(words):
            if not valid(word):
                continue
            counts[word]+=1
            if i<len(lemmas):
                lid=lemmas[i].split('|')[0]
                if lid.isdecimal() and word not in lemma:
                    lemma[word]=lid
    if sentences<10000 or len(counts)<700:
        raise RuntimeError('TLA corpus seems truncated: sentences=%d forms=%d'%(sentences,len(counts)))
    rows=[[word,count,lemma.get(word,'')] for word,count in counts.most_common()]
    TARGET.parent.mkdir(parents=True,exist_ok=True)
    TARGET.write_text(json.dumps({
        'schema':1,
        'kind':'attested-wordforms',
        'language_stage':'Earlier Egyptian (not Late Egyptian)',
        'source':'Thesaurus Linguae Aegyptiae Original Earlier Egyptian v18 premium',
        'url':'https://huggingface.co/datasets/thesaurus-linguae-aegyptiae/tla-Earlier_Egyptian_original-v18-premium',
        'license':'CC BY-SA 4.0',
        'sentences':sentences,
        'rows':rows
    },ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print('Egyptian attested word forms:',len(rows),'from',sentences,'sentences')

if __name__=='__main__':
    if len(sys.argv)!=2:
        raise SystemExit('Usage: python build_egyptian_words.py /path/to/train.jsonl')
    main(sys.argv[1])
