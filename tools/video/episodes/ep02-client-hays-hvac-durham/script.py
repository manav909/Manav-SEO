EP = 2
CHECKED = "17 Nov 2026"
# Episode 2 (client story): every fact is taken from the published story page
# https://businesssanta.com/results/hvac-seo-durham-nc (published 14 Nov 2026) and its dated proof images:
# the live Google US screenshot of 14 Nov 2026 and the client's own message of 6 Jan 2026.
# Client quotes are word for word from that page. Company name only, never a person's name.
# No fresh Google check in this run: Google showed an "unusual traffic" page on 17 Nov 2026, so the 14 Nov screenshot is used, with its date.

CAPS = [('forty one point nine', '41.9'), ('twenty four point five', '24.5'), ('nineteen ninety six', '1996'),
        ('forty three', '43'), ('fifty four point two thousand', '54.2K'), ('one point one thousand', '1.1K'),
        ('number two', 'number 2'), ('number five', 'number 5'), ('business santa dot com', 'businesssanta.com'),
        ('H V A C', 'HVAC'), ('N C', 'NC'), ('A C', 'AC'), ('one hundred', '100')]

SCENES = [
 dict(kind="hook",
      n="An H V A C company in Durham went from an average Google position of forty one point nine to twenty four point five in one month. "
        "Today it sits at number two on Google for H V A C company Durham N C. Here's exactly what was done.",
      a=("41.9", "24.5"), sub="average Google position, lower is better (Dec 2025)", b="Now #2 for \"hvac company durham nc\""),
 dict(kind="title",
      n="This is Local Visibility Check, from Business Santa. Today, a real client story, with the dates and the sources on screen.",
      big="Hays HVAC, Durham, NC", sub="A real client story: what moved them up Google", tag="CLIENT STORY  |  EPISODE 2"),
 dict(kind="three", title="Where they started",
      items=[("Since 1996", "Serving Durham and the Triangle"), ("The goal", "Be found on Google, and recommended by ChatGPT"), ("Day one", "A 43 minute call, and work began that day")],
      cap="Source: businesssanta.com/results/hvac-seo-durham-nc",
      n="Hays H V A C has served Durham and the Triangle since nineteen ninety six. "
        "In October twenty twenty five the owner wanted two things: a site set up properly for Google, and ChatGPT recommending his company when people ask for an H V A C company. "
        "After a forty three minute call, the work started the same day."),
 dict(kind="list", title="What was done, month by month",
      rows=[("1", "Foundation SEO and AI search", "Oct 2025", ""),
            ("2", "Monthly links and blogs", "from Nov 2025", ""),
            ("3", "Service pages rewritten", "from Dec 2025", ""),
            ("4", "New service plan page", "May to Jun 2026", "")],
      n="First, the foundation: an audit, keyword research, titles, descriptions, headings, the sitemap, robots and schema. "
        "Then, from November, links and blogs every month, each blog approved by the owner in one line. "
        "From December, the service pages were rewritten for search. "
        "And this year, a new comfort service plan page, built from the owner's own document."),
 dict(kind="compare", title="Average Google position, December 2025",
      left=("before", "41.9", "about page 5"), right=("after", "24.5", "about page 3"),
      who="Lower is better. Source: the client's December 2025 report",
      n="Here is the jump that surprised even us. In the December twenty twenty five report, the average Google position moved from forty one point nine to twenty four point five. "
        "Lower is better here. That is roughly from page five to page three, in one month, with a higher click through rate."),
 dict(kind="quote", title="The numbers, with their dates",
      lines=["54.2K Google impressions (November 2025 report)", "1.1K searches the site ranks for (November 2025)", "Renewed month after month, including two 2 month plans"],
      n="The November report showed fifty four point two thousand Google impressions, and one point one thousand searches the site ranks for. "
        "And the owner renewed month after month."),
 dict(kind="shot", img="google.jpg",
      n="And here is Google today. On November fourteenth, twenty twenty six, Hays sat at number two for H V A C company Durham N C, the first H V A C company website in the results. "
        "It was also number five for H V A C maintenance plan Durham, and for A C repair cost Durham, with a Hays blog page.",
      hl=(80, 904, 1120, 1112), say="Number two, and the first HVAC company website in the results.", cap="Google US, \"hvac company durham nc\", screenshot 14 Nov 2026. Results vary by location and time."),
 dict(kind="quote", title="In the owner's own words",
      lines=["\"Yes the blog post look good. Thanks\"  (Nov 2025)", "\"Yes I want to keep working with you.\"  (Jan 2026)", "\"Everything seems to be going well.\"  (May 2026)"],
      n="In the owner's own words. November: yes the blog post look good, thanks. "
        "January: yes, I want to keep working with you. "
        "May, renewing for two more months: everything seems to be going well."),
 dict(kind="fixes", title="3 things any HVAC company can do this week",
      items=["Give every service its own page, with your city in the title",
             "Write blogs that answer the cost questions people ask before they call",
             "Add schema and a clear page structure, so Google and ChatGPT can read you"],
      n="So, three things any H V A C company can do this week, as the cold weather brings the calls. "
        "One. Give every service its own page, with your city in the title. "
        "Two. Write blogs that answer the cost questions people ask before they call, like A C repair cost in your city. "
        "Three. Add schema and a clear page structure, so both Google and ChatGPT can read your site."),
 dict(kind="cta", title="Free: check your Google profile in 2 minutes",
      url="businesssanta.com/google-profile-score",
      n="Want to know where your business stands? Take our free Google profile score. Twelve yes or no questions, a score out of one hundred, and your fixes in order. "
        "It's at business santa dot com. No sign up needed."),
 dict(kind="end", ask="Comment CHECK and your city for a free look at your business",
      foot="Figures from the client's dated reports and a Google US screenshot of 14 Nov 2026. Full story: businesssanta.com/results",
      n="This was Local Visibility Check, by Business Santa, powered by SEO Season. "
        "Comment CHECK and your city, and we'll take a free look at how your business shows on Google and ChatGPT. And subscribe for the next check."),
]
