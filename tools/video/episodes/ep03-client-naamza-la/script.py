EP = 3
CHECKED = "13 Nov 2026"
# Episode 3 (client story): every fact is taken from the published story page
# https://businesssanta.com/results/barbershop-seo-los-angeles (published 15 Nov 2026) and its dated proof images:
# the live Google US screenshots of 13 Nov 2026 and the client's own message of 27 Jan 2026.
# Client quotes are word for word from that page and that message. Company name only, never a person's name.
# No new Google check in this run (cloud run, no browser): the 13 Nov screenshots are used, with their date on screen.

CAPS = [('number three', '#3'), ('eight hundred thirty seven', '837'), ('twenty twenty five', '2025'), ('twenty twenty six', '2026'),
        ('business santa dot com', 'businesssanta.com'), ('L A', 'LA'), ('thirty seven', '37'), ('twenty', '20'), ('one hundred', '100'),
        ('November thirteenth', 'November 13'), ('January twenty seventh', 'January 27')]

SCENES = [
 dict(kind="three", bignum=True, title="How does a barbershop get on page 1?",
      items=[("#3", "for \"mens perm los angeles\""), ("#3", "for \"asian mens haircut los angeles\""), ("837", "organic visits a month (March 2026 report)")],
      cap="Google US screenshots, 13 Nov 2026. Story: businesssanta.com/results/barbershop-seo-los-angeles",
      n="How does a barbershop get on page one of Google? This one in Los Angeles sits at number three for mens perm Los Angeles, "
        "and number three for Asian mens haircut Los Angeles. Here's exactly what was done."),
 dict(kind="title",
      n="This is Local Visibility Check, from Business Santa. Today, a real client story, with the dates and the sources on screen.",
      big="Naamza, Los Angeles", sub="Two barbershops for Asian men's hair", tag="CLIENT STORY  |  EPISODE 3"),
 dict(kind="three", title="Where they started",
      items=[("2 shops", "Olympic Blvd and Koreatown, Los Angeles"), ("The niche", "Asian straight hair and the Korean men's perm"), ("Before", "Backlink-only SEO, with no results")],
      cap="Source: businesssanta.com/results/barbershop-seo-los-angeles",
      n="Naamza is two barbershops in Los Angeles, one on Olympic Boulevard and one in Koreatown. "
        "They specialize in hair many salons find hard: straight, stubborn Asian hair, and the Korean style men's perm. "
        "They had tried backlink only SEO before, with no results. "
        "So the goal was simple. Be found for exactly what they do best."),
 dict(kind="list", title="What was done, month by month",
      rows=[("1", "Foundation SEO, site optimized in 2 days", "Nov 2025", ""),
            ("2", "Blogs only Naamza could write", "Nov 2025 to Feb 2026", ""),
            ("3", "Both shops listed and linked", "Feb to Jun 2026", ""),
            ("4", "Service pages for the men's perm", "Feb to Jun 2026", "")],
      n="It started in November twenty twenty five with a thirty seven minute call about the business, the clients and the competitors. "
        "The whole Squarespace site was optimized in two days. "
        "Then came blogs that only Naamza could publish: Asian straight hair, the Korean down perm, the loose perm trend. "
        "From February, the Koreatown shop got its own listings and links, like the first one. "
        "And the men's perm got dedicated service pages, linked from those blogs."),
 dict(kind="shot", img="card-serp-mens-perm-los-angeles.jpg",
      n="Here is Google on November thirteenth, twenty twenty six. For mens perm Los Angeles, Naamza is number three, "
        "the first website right below the Google Maps results.",
      hl=(205, 530, 682, 634), say="#3, the first website below the Maps results.",
      cap="Google US, \"mens perm los angeles\", screenshot 13 Nov 2026. Results vary by location and time."),
 dict(kind="shot", img="card-serp-asian-mens-haircut-los-angeles.jpg",
      n="And for Asian mens haircut Los Angeles, the same day, Naamza is number three again, ahead of the specialist shops listed below it. "
        "The March twenty twenty six report showed organic traffic up to eight hundred thirty seven visits a month.",
      hl=(205, 530, 682, 634), say="#3 again, ahead of the specialist shops below it.",
      cap="Google US, \"asian mens haircut los angeles\", screenshot 13 Nov 2026. Results vary by location and time."),
 dict(kind="quote", title="In the owner's own words",
      lines=["\"Excited to see our website grow!\"  (Nov 2025)", "\"This is great. Thanks a lot.\"  (Jan 2026)", "\"I love the content about Korean down perm.\"  (Feb 2026)"],
      n="In the owner's own words. November: excited to see our website grow. "
        "January, on the Asian straight hair blog: this is great, thanks a lot. "
        "February: I love the content about Korean down perm."),
 dict(kind="shot", img="card-t4-us-barbershop.jpg",
      n="And this message came on January twenty seventh, twenty twenty six: great news, thank you. "
        "Excited to get the monthly report from you once this month's service is done. Thanks for your great work.",
      cap="The client's own message, 27 January 2026, as shown on the story page."),
 dict(kind="three", title="What made the difference",
      items=[("Niche", "Write only about what makes the shop special"), ("Their words", "Content in the voice of their own clients"), ("Clear reports", "Rankings for their own target terms, explained")],
      cap="Source: businesssanta.com/results/barbershop-seo-los-angeles",
      n="So what made the difference? Writing only about what makes this business special. "
        "Content in the voice of its own clients. "
        "And reports that track the shop's own target searches, explained in plain words, so a busy owner can see what moved."),
 dict(kind="fixes", title="3 things any salon or barbershop can do this week",
      items=["Give the one thing you do best its own service page, named the way clients search for it",
             "Blog about the questions only your shop can answer, in your clients' own words",
             "List every location on Google and keep each listing's details matching"],
      n="So, three things any salon or barbershop can do this week. "
        "One. Give the one thing you do best its own service page, named the way your clients search for it. "
        "Two. Blog about the questions only your shop can answer, in your clients' own words. "
        "Three. If you have more than one location, list every one on Google, and keep each listing's details matching."),
 dict(kind="cta", title="Free: check your Google profile in 2 minutes",
      url="businesssanta.com/google-profile-score",
      n="Want to know where your shop stands? Take our free Google profile score. Twelve yes or no questions, a score out of one hundred, and your fixes in order. "
        "It's at business santa dot com. No sign up needed."),
 dict(kind="end", ask="Subscribe for the next check. Full story: businesssanta.com/results",
      foot="Figures from the client's dated reports and Google US screenshots of 13 Nov 2026. Full story: businesssanta.com/results",
      n="This was Local Visibility Check, by Business Santa, powered by SEO Season. "
        "The full story, with every date and source, is at business santa dot com. Subscribe for the next check."),
]
