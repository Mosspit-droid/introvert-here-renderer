# Draft tag pools for review. CLASS: A = Anchor (broad, uncapped), F = Flavour (specific, capped).
# Gag-level pools are keyed by the GAG_CATEGORY names used in Core.

GAG_POOLS = {
    "Social Anxiety": {
        "A": ["social anxiety humor", "anxious introvert", "shy person humour", "socially awkward"],
        "F": ["awkward introvert", "shy person gift", "anxiety humor", "people scare me", "socially anxious",
              "nervous introvert", "awkward humor", "shy guy gift", "shy girl gift", "anxious humour",
              "overwhelmed person", "awkward gift idea"],
    },
    "Overthinking": {
        "A": ["overthinking humor", "overthinker humour", "anxious thoughts"],
        "F": ["overthinker gift", "chronic overthinker", "overanalyzing", "thinking too much", "deep thinker gift",
              "worrier gift", "midnight thoughts", "mind racing", "anxious mind", "what if thinker",
              "overthinking club", "brain won't stop"],
    },
    "Small Talk": {
        "A": ["small talk", "awkward conversation", "hate small talk"],
        "F": ["no small talk", "anti small talk", "talking is hard", "awkward silence", "polite nod",
              "chit chat hater", "conversation hater", "avoid eye contact", "words are hard", "done talking",
              "small talk survivor", "introvert talking", "quiet person humor"],
    },
    "Avoiding People": {
        "A": ["avoiding people", "antisocial humor", "leave me alone", "stay home humour"],
        "F": ["antisocial club", "people repellent", "not a people person", "peopling is hard", "hermit gift",
              "homebody humor", "do not disturb", "cancel plans", "plans cancelled", "stay home club",
              "introvert hermit", "home alone happy", "social distance pro", "rsvp no", "do not invite me", "hiding from people", "go away humor", "people free zone", "solo plans", "staying in tonight", "antisocial butterfly", "introvert hideout", "no visitors please", "away from people"],
    },
    "Workplace": {
        "A": ["office humor", "workplace sarcasm", "coworker gift"],
        "F": ["office introvert", "work from home", "meeting hater", "desk job humor", "quiet coworker",
              "office survival", "cubicle humor", "wfh introvert", "coworker humor", "job humor",
              "work life humour", "email warrior"],
    },
    "Introvert Life": {
        "A": ["introvert life humor", "introvert humor", "dry humour", "introvert gift"],
        "F": ["introverted gift", "quiet person", "solitude lover", "homebody gift", "introvert club",
              "alone time", "me time", "recharge time", "quiet life", "loner gift", "inner peace humor",
              "low key living", "introvert vibes", "quiet night in", "introvert problems", "book and blanket", "cozy introvert", "silence lover", "happy alone", "own company", "introvert at heart", "peace and quiet", "solo date", "stay in club", "quiet weekend"],
    },
    "Social Exhaustion": {
        "A": ["social exhaustion", "exhausted introvert", "drained battery"],
        "F": ["social battery low", "recharge alone", "peopled out", "need a nap", "battery at 1",
              "introvert hangover", "tired of people", "socially drained", "over socialized", "need alone time",
              "party pooper", "tired humor", "socially tired", "recharging", "people overload", "introvert burnout", "need recharge", "out of social energy"],
    },
    "Sensory Issues": {
        "A": ["sensory overload", "quiet spaces", "sensory sensitivity"],
        "F": ["noise sensitive", "too loud", "low stimulation", "sensory sensitive", "autism friendly",
              "neurodivergent gift", "sound sensitive", "need quiet", "calm space", "overstimulated",
              "quiet please", "sensory gift"],
    },
    "Alternative Communication": {
        "A": ["non verbal", "quiet communication", "selective speaking"],
        "F": ["nonverbal gift", "speaks in shirts", "wordless humor", "gentle humor", "silent statement",
              "talk to the shirt", "quiet voice", "words optional", "let the shirt talk", "social alternative",
              "shirt does talking", "silent humor"],
    },
    "Off The Clock": {
        "A": ["off the clock", "work life balance", "after hours gift"],
        "F": ["clocked out", "logged off", "weekend mode", "out of office", "unplug and relax", "personal time",
              "do not email", "no overtime", "home time", "shift over", "five o'clock humor", "end of shift"],
    },
    "Corporate Nonsense": {
        "A": ["corporate satire", "corporate humor", "office satire"],
        "F": ["meeting survivor", "buzzword fatigue", "bureaucracy humour", "cubicle escape", "synergy humor",
              "per my last email", "circle back humor", "corporate jargon", "middle management",
              "team building hater", "reply all humor", "pointless meetings"],
    },
    "Quiet Quitting": {
        "A": ["quiet quitting", "bare minimum effort", "work humor"],
        "F": ["coasting at work", "do the least", "checked out mentally", "minimum effort", "acting my wage",
              "not my job", "work to live", "done with work", "counting the hours", "office slacker",
              "lunch break hero", "effort optional"],
    },
    "Burnout": {
        "A": ["total burnout", "burnt out", "burnout gift"],
        "F": ["running on fumes", "over it", "needs a holiday", "exhausted energy", "burnout humor",
              "running on empty", "stressed out", "need a break", "dead inside humor", "fried brain",
              "tired worker", "coffee and burnout"],
    },
}

# Non-seasonal fallback for the two seasonal slots (used when the manual column is empty or out of season).
# POOL "ALL" applies to every collection; collection names add collection-specific options.
FALLBACK = {
    "ALL": ["funny gift idea", "gift for introvert", "sarcastic gift", "birthday gift", "gag gift", "novelty gift",
            "humor gift", "dry humor gift", "gift for loner", "gift for friend", "funny gift for her",
            "funny gift for him"],
    "INTROVERT HERE…": ["introvert present", "homebody present"],
    "SHHH.": ["thoughtful gift", "quiet person gift"],
    "PER CONTRACT": ["coworker present", "leaving gift", "retirement gift", "colleague gift"],
}

# Approved seasonal phrases for CUSTOM_TAG_12 / CUSTOM_TAG_13. Window = MMDD start..end (wraps over New Year).
SEASONAL = [
    ("christmas present", "CHRISTMAS", 1001, 1224),
    ("holiday gift", "CHRISTMAS", 1001, 1231),
    ("christmas gift", "CHRISTMAS", 1001, 1224),
    ("secret santa gift", "CHRISTMAS", 1101, 1222),
    ("stocking stuffer", "CHRISTMAS", 1101, 1224),
    ("new year gift", "NEW_YEAR", 1226, 107),
    ("valentines gift", "VALENTINES", 120, 214),
    ("anti valentines", "VALENTINES", 120, 214),
    ("mothers day gift", "MOTHERS_DAY", 301, 512),
    ("easter gift", "EASTER", 315, 420),
    ("graduation gift", "GRADUATION", 501, 630),
    ("fathers day gift", "FATHERS_DAY", 520, 621),
    ("back to school", "BACK_TO_SCHOOL", 801, 915),
    ("halloween gift", "HALLOWEEN", 1001, 1031),
]
