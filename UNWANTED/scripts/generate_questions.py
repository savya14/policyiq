import pickle
import re
import json
import random
import os

try:
    with open('vector_store/index.pkl', 'rb') as f:
        data = pickle.load(f)
except Exception as e:
    print(f"Error loading pickle file: {e}")
    data = []

# Assuming data is a tuple or dict, let's extract chunks.
# The prompt says: extract list of (text, source_document_name) tuples
# Wait, the prompt says "Based on inspection, extract list of (text, source_document_name) tuples".
# Let's inspect the actual structure first to be safe.
print(type(data))
if isinstance(data, tuple) and len(data) == 2:
    print("Data is a tuple of length 2")
    # data[0] is typically InMemoryDocstore, data[1] is index_to_docstore_id
    docstore = data[0]
    chunks = []
    if hasattr(docstore, '_dict'):
        for doc_id, doc in docstore._dict.items():
            text = doc.page_content
            source = doc.metadata.get('source', 'Unknown')
            chunks.append((text, source))
    else:
        print("Unknown docstore format")
else:
    print("Unknown data format")
    chunks = []

DOC_NAME_MAP = {
    'OISD-STD-116': 'OISD STD 116',
    'OISD-STD-117': 'OISD STD 117',
    'OISD-STD-118': 'OISD STD 118',
    'OISD-STD-105': 'OISD STD 105',
    'OISD-STD-129': 'OISD STD 129',
    'OISD-STD-144': 'OISD STD 144',
    'OISD-STD-152': 'OISD STD 152',
    'OISD-STD-175': 'OISD STD 175',
    'OISD-STD-190': 'OISD STD 190',
    'OISD-STD-194': 'OISD STD 194',
    'OISD-STD-201': 'OISD STD 201',
    'OISD-STD-226': 'OISD STD 226',
    'OISD-STD-233': 'OISD STD 233',
    'OISD-STD-142': 'OISD STD 142',
    'PESO_Petroleum': 'PESO Petroleum Rules 2002',
    'PESO_Gas': 'PESO Gas Cylinder Rules',
    'PESO_Explosives': 'PESO Explosives Rules 2008',
    'PESO_SMPV': 'PESO SMPV Rules 2016',
    'PESO_Ammonium': 'PESO Ammonium Nitrate Rules',
    'PNGRB_ERDMP': 'PNGRB ERDMP Regulations 2020',
    'PNGRB_T4S': 'PNGRB T4S Petroleum Pipeline Standards',
    'PNGRB_NGPL': 'PNGRB NGPL T4S Safety Standards',
    'PNGRB_Gas': 'PNGRB Gas Supplies Guidelines',
    'PNGRB_Case': 'PNGRB Major Incident Case Studies',
    'MoPNG': 'MoPNG Guidelines',
}

def clean_doc_name(raw_name):
    for key, value in DOC_NAME_MAP.items():
        if key.lower() in raw_name.lower():
            return value
    return raw_name.replace('_', ' ').replace('-', ' ').strip()

STOPWORDS = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 
             'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 
             'would', 'could', 'should', 'may', 'might', 'shall', 'to', 
             'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
             'into', 'through', 'during', 'before', 'after', 'above',
             'below', 'up', 'down', 'out', 'off', 'over', 'under', 'and',
             'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
             'neither', 'each', 'few', 'more', 'most', 'other', 'some',
             'such', 'than', 'too', 'very', 'just', 'that', 'this',
             'these', 'those', 'it', 'its', 'which', 'who', 'whom'}

def extract_questions(chunk_text, doc_name):
    questions = []
    lines = chunk_text.split('\n')
    
    for i, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue
        is_heading = (
            (line.isupper() and len(line) > 4 and len(line) < 80) or
            (len(line) < 70 and line.endswith(':')) or
            (re.match(r'^\d+(\.\d+)*\s+[A-Z]', line) and len(line) < 80)
        )
        if is_heading:
            clean = re.sub(r'^\d+(\.\d+)*\s*', '', line).strip().rstrip(':')
            if len(clean) > 5:
                questions.append(f"What are the requirements for {clean} as per {doc_name}?")
                questions.append(f"Explain {clean} under {doc_name}.")
    
    clause_patterns = [
        r'[Cc]lause\s+(\d+[\.\d]*)',
        r'[Ss]ection\s+(\d+[\.\d]*)',
        r'[Pp]ara(?:graph)?\s+(\d+[\.\d]*)',
        r'(?<!\d)(\d{1,2}\.\d{1,3}(?:\.\d{1,3})?)\s+[A-Z]',
    ]
    for pattern in clause_patterns:
        matches = re.findall(pattern, chunk_text)
        for match in matches:
            questions.append(f"What does clause {match} of {doc_name} specify?")
            questions.append(f"Explain the requirements under section {match} of {doc_name}.")
    
    def_patterns = [
        r'"([A-Z][a-zA-Z\s]{2,40})" means',
        r'"([A-Z][a-zA-Z\s]{2,40})" is defined as',
        r'[Dd]efinition of "?([A-Z][a-zA-Z\s]{2,40})"?',
        r'([A-Z][A-Z\s]{2,30}) means ',
    ]
    for pattern in def_patterns:
        matches = re.findall(pattern, chunk_text)
        for match in matches:
            match = match.strip()
            if 3 < len(match) < 50:
                questions.append(f"What is the definition of {match} as per {doc_name}?")
                questions.append(f"What does {match} mean in Indian oil and gas regulations?")
    
    shall_sentences = re.findall(r'([A-Z][^.]{10,120}(?:shall|must|required to|it is mandatory)[^.]{5,80}\.)', chunk_text)
    for sentence in shall_sentences[:3]:
        subject_match = re.match(r'^([A-Z][^,\.]{5,50}?)(?:\s+shall|\s+must|\s+is required)', sentence)
        if subject_match:
            subject = subject_match.group(1).strip()
            questions.append(f"What are the mandatory requirements for {subject} under {doc_name}?")
    
    EQUIPMENT_TERMS = [
        'fire extinguisher', 'sprinkler system', 'dyke wall', 'bund wall',
        'pressure vessel', 'safety valve', 'relief valve', 'storage tank',
        'LPG vessel', 'flare stack', 'pump', 'compressor', 'pipeline',
        'detector', 'alarm system', 'foam system', 'hydrant', 'hose reel',
        'earthing', 'bonding', 'ventilation', 'work permit', 'hot work',
        'cold work', 'confined space', 'gas detector', 'fire water'
    ]
    chunk_lower = chunk_text.lower()
    for equipment in EQUIPMENT_TERMS:
        if equipment in chunk_lower:
            questions.append(f"What are the {equipment} requirements under {doc_name}?")
            questions.append(f"What does {doc_name} specify about {equipment}?")
    
    return questions

DOMAIN_KEYWORDS = {
    'oisd', 'peso', 'pngrb', 'mopng', 'clause', 'section', 'petroleum',
    'pipeline', 'refinery', 'lpg', 'fire', 'safety', 'tank', 'valve',
    'drilling', 'gas', 'installation', 'storage', 'pressure', 'explosive',
    'regulation', 'standard', 'requirement', 'inspection', 'permit',
    'protection', 'hazard', 'emergency', 'flammable', 'combustible'
}

def is_valid_question(q):
    if len(q) < 30:
        return False
    q_lower = q.lower()
    has_domain = any(kw in q_lower for kw in DOMAIN_KEYWORDS)
    if not has_domain:
        # Loosen the domain keyword filter automatically if needed, but for now we keep it strict
        return False
    return True

def deduplicate(questions):
    seen_exact = set()
    unique = []
    for q in questions:
        q_normalized = q.lower().strip()
        if q_normalized not in seen_exact:
            seen_exact.add(q_normalized)
            unique.append(q)
    
    def get_keywords(q):
        words = set(re.findall(r'\b\w+\b', q.lower()))
        return words - STOPWORDS
    
    final = []
    keyword_sets = []
    for q in unique:
        kw = get_keywords(q)
        is_duplicate = False
        for existing_kw in keyword_sets:
            if len(kw) == 0:
                continue
            overlap = len(kw & existing_kw) / len(kw | existing_kw)
            if overlap > 0.8:
                is_duplicate = True
                break
        if not is_duplicate:
            final.append(q)
            keyword_sets.append(kw)
    
    return final

all_questions = []
chunks_processed = 0

for chunk_text, raw_doc_name in chunks:
    doc_name = clean_doc_name(raw_doc_name)
    questions = extract_questions(chunk_text, doc_name)
    all_questions.extend(questions)
    chunks_processed += 1

print(f"Chunks processed: {chunks_processed}")
print(f"Raw questions generated: {len(all_questions)}")

filtered = [q for q in all_questions if is_valid_question(q)]
print(f"After domain filtering: {len(filtered)}")

# Fallback: if fewer than 150 questions, loosen filter
if len(filtered) < 150:
    print("Fewer than 150 questions found. Loosening filter...")
    looser_keywords = DOMAIN_KEYWORDS - {'regulation', 'standard', 'requirement', 'inspection', 'permit'}
    def is_valid_question_loose(q):
        if len(q) < 30:
            return False
        q_lower = q.lower()
        return any(kw in q_lower for kw in looser_keywords)
    
    filtered = [q for q in all_questions if is_valid_question_loose(q)]
    print(f"After loose filtering: {len(filtered)}")

deduped = deduplicate(filtered)
print(f"After deduplication: {len(deduped)}")

random.shuffle(deduped)

os.makedirs('frontend/src/data', exist_ok=True)
with open('frontend/src/data/questions.json', 'w', encoding='utf-8') as f:
    json.dump(deduped, f, ensure_ascii=False, indent=2)

print(f"Saved {len(deduped)} questions to frontend/src/data/questions.json")

print("\nSample questions:")
for q in random.sample(deduped, min(10, len(deduped))):
    print(f"  - {q}")
