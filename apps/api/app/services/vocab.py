"""Skill / tool vocabulary with synonyms. Canonical form = first item. Extended at runtime from SkillCatalog aliases."""
from __future__ import annotations

import re
import threading
import time

_SYN = [
    ["javascript", "js", "ecmascript", "es6"], ["typescript", "ts"], ["python", "python3", "py"],
    ["node.js", "nodejs", "node"], ["react", "react.js", "reactjs"], ["next.js", "nextjs"], ["vue", "vue.js", "vuejs"],
    ["angular", "angularjs"], ["postgresql", "postgres", "psql"], ["mysql"], ["mongodb", "mongo"], ["sql", "structured query language"],
    ["kubernetes", "k8s"], ["docker", "containers", "containerization"], ["amazon web services", "aws"],
    ["google cloud", "gcp", "google cloud platform"], ["microsoft azure", "azure"], ["ci/cd", "cicd", "continuous integration", "continuous delivery"],
    ["machine learning", "ml"], ["artificial intelligence", "ai"], ["natural language processing", "nlp"], ["deep learning", "dl"],
    ["data analysis", "data analytics", "analytics", "data analyst"], ["power bi", "powerbi"], ["tableau"],
    ["microsoft excel", "excel", "ms excel", "spreadsheets"], ["microsoft office", "ms office", "office 365", "microsoft 365"],
    ["powerpoint", "ms powerpoint"], ["microsoft word", "ms word"], ["google workspace", "g suite", "gsuite"],
    ["project management", "managing projects", "project delivery"], ["agile", "scrum", "kanban"],
    ["product management", "product manager"], ["stakeholder management", "stakeholder engagement"],
    ["customer service", "customer support", "client service", "customer care", "customer experience"],
    ["sales", "selling", "business development", "bd"], ["marketing", "digital marketing", "online marketing"],
    ["search engine optimization", "seo"], ["social media", "social media management", "smm"], ["content writing", "copywriting", "content creation"],
    ["accounting", "bookkeeping", "financial accounting"], ["financial reporting", "ifrs", "gaap"], ["auditing", "audit", "internal audit"],
    ["taxation", "tax", "tax compliance"], ["financial analysis", "financial modelling", "financial modeling"],
    ["quickbooks", "qb"], ["sage", "sage accounting"], ["sap", "sap erp"], ["erp", "enterprise resource planning"],
    ["human resources", "hr", "people operations"], ["recruitment", "recruiting", "talent acquisition"],
    ["payroll", "payroll management"], ["leadership", "team leadership", "people management", "team management"],
    ["communication", "communication skills", "verbal communication", "written communication"],
    ["problem solving", "problem-solving"], ["teamwork", "collaboration"], ["negotiation", "negotiating"],
    ["public speaking", "presentation skills", "presentations"], ["research", "research skills"],
    ["teaching", "lesson planning", "classroom management", "pedagogy"], ["nursing", "patient care"],
    ["procurement", "purchasing", "sourcing"], ["supply chain", "logistics", "supply chain management"],
    ["inventory management", "stock control"], ["autocad", "cad"], ["civil engineering"], ["mechanical engineering"],
    ["electrical engineering"], ["health and safety", "hse", "occupational health and safety"],
    ["cybersecurity", "information security", "infosec", "cyber security"], ["networking", "computer networks", "network administration"],
    ["linux", "unix"], ["git", "github", "gitlab", "version control"], ["rest api", "rest", "restful", "api development", "apis"],
    ["graphql"], ["java"], ["c#", "csharp", ".net", "dotnet"], ["php", "laravel"], ["django"], ["fastapi"], ["flask"],
    ["figma"], ["ui/ux design", "ux", "ui", "user experience", "user interface design", "product design"],
    ["graphic design", "adobe photoshop", "photoshop", "illustrator"], ["video editing", "premiere pro"],
    ["data entry"], ["crm", "salesforce", "hubspot", "customer relationship management"], ["banking", "retail banking"],
    ["risk management", "risk assessment"], ["compliance", "regulatory compliance", "aml", "kyc"],
    ["monitoring and evaluation", "m&e"], ["grant writing", "proposal writing"], ["community management", "community engagement"],
    ["apache kafka", "kafka"], ["redis"], ["rabbitmq"], ["elasticsearch"], ["golang", "go lang"], ["rust"], ["kotlin"], ["swift"],
    ["flutter", "dart"], ["react native"], ["terraform"], ["microservices", "micro-services"], ["spark", "apache spark", "pyspark"],
    ["airflow", "apache airflow"], ["dbt"], ["snowflake"], ["bigquery"], ["pandas"], ["looker"], ["jira"],
    ["oil and gas", "petroleum"], ["statistics", "statistical analysis", "spss", "stata"], ["r", "r programming"],
]

_STOP = set("""a an the and or of to in for with on at by from as is are be been being this that these those you your we our
will would should can could must may might have has having do does did not no nor but if then than so such into over under
about across per via etc e g i ie eg using use used ability able strong good excellent proven solid working knowledge
experience experienced years year plus minimum least including include includes required requirement requirements
preferred preferably candidate candidates role job position team teams work works who what when where which while
skills skill understanding familiarity hands on new also other related relevant equivalent demonstrated track record
responsible responsibilities duties""".split())

_lock = threading.Lock()
_alias_to_canon: dict[str, str] = {}
_catalog_loaded_at = 0.0


def norm(s: str) -> str:
    s = (s or "").lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9+#./ ]+", " ", s)
    s = re.sub(r"(?<![a-z0-9])\.|\.(?![a-z0-9])", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _build_base() -> dict[str, str]:
    m = {}
    for group in _SYN:
        canon = norm(group[0])
        for a in group:
            m.setdefault(norm(a), canon)
    return m


_alias_to_canon.update(_build_base())


def load_catalog(db) -> None:
    """Merge SkillCatalog names/aliases (refresh at most every 10 minutes)."""
    global _catalog_loaded_at
    if time.time() - _catalog_loaded_at < 600:
        return
    try:
        from app.models import SkillCatalog
        rows = db.query(SkillCatalog.name, SkillCatalog.aliases).filter(SkillCatalog.is_active.is_(True)).limit(20000).all()
    except Exception:  # noqa: BLE001
        return
    with _lock:
        for name, aliases in rows:
            n = norm(name)
            if not n or len(n) < 2:
                continue
            canon = _alias_to_canon.get(n, n)
            _alias_to_canon.setdefault(n, canon)
            for a in aliases or []:
                an = norm(str(a))
                if an and len(an) >= 2:
                    _alias_to_canon.setdefault(an, canon)
        _catalog_loaded_at = time.time()


def canon(s: str) -> str:
    n = norm(s)
    return _alias_to_canon.get(n, n)


def known(term: str) -> bool:
    return norm(term) in _alias_to_canon


def find_terms(text: str, max_words: int = 4) -> list[str]:
    """Known skills/tools mentioned in text, canonicalised, in order of appearance."""
    words = norm(text).split()
    found, seen = [], set()
    i = 0
    while i < len(words):
        hit = None
        for n in range(min(max_words, len(words) - i), 0, -1):
            phrase = " ".join(words[i:i + n])
            if phrase in _alias_to_canon and (n > 1 or (len(phrase) > 1 and phrase not in _STOP) or phrase in ("r", "c")):
                hit = (phrase, n)
                break
        if hit:
            c = _alias_to_canon[hit[0]]
            # single letters only count when written like a language ("R", "C") — skip in prose
            if not (len(hit[0]) == 1):
                if c not in seen:
                    seen.add(c)
                    found.append(c)
            i += hit[1]
        else:
            i += 1
    return found


def keywords(text: str) -> list[str]:
    out, seen = [], set()
    for w in norm(text).split():
        w = w.strip("./")
        if len(w) < 3 or w in _STOP or w.isdigit():
            continue
        if w not in seen:
            seen.add(w)
            out.append(w)
    return out


def stem(w: str) -> str:
    for suf in ("ization", "isation", "ations", "ation", "ments", "ment", "ings", "ing", "ies", "ers", "er", "ed", "es", "s"):
        if w.endswith(suf) and len(w) - len(suf) >= 4:
            return w[: -len(suf)]
    return w
