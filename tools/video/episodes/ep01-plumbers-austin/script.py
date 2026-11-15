EP = 1
CHECKED = "15 Nov 2026"
# Episode 1 script: every fact below was read off the screen on 15 Nov 2026.
# Google checks: about 4:50 am and 7:15 am Austin time. ChatGPT check: about 7:20 am Austin time.

SCENES = [
 dict(kind="hook",
      n="One plumber in Austin went from number eleven to number one on Google, in about two hours. "
        "And when we asked ChatGPT the same question, it skipped Google's top three completely. Here's what we found.",
      a=("#11", "#1"), b="ChatGPT skipped Google's top 3"),
 dict(kind="title",
      n="This is Local Visibility Check, from Business Santa. Each episode, we check one trade in one US city, by hand, on Google and on ChatGPT.",
      big="Plumbers in Austin, TX", sub="Who gets the call on Google and ChatGPT?", tag="LOCAL VISIBILITY CHECK  |  EPISODE 1"),
 dict(kind="shot", img="google.jpg",
      n="Here is Google's local list for plumbers Austin T X, on November fifteenth, at about seven fifteen in the morning, Austin time. "
        "The map is full. There are dozens of plumbers here, and only three get the top spots.",
      hl=(48, 279, 332, 382), cap="Google, Places results for \"plumbers Austin TX\", 15 Nov 2026, about 7:15 am Austin time"),
 dict(kind="list", title="Google's top 3 at 7:15 am",
      rows=[("1", "O & M Plumbing Services", "4.9 stars", "787 reviews"),
            ("2", "Plumb Masters", "4.8 stars", "441 reviews"),
            ("3", "Garrett's Plumbing, North Austin", "5.0 stars", "63 reviews")],
      n="The top three were O and M Plumbing Services, with four point nine stars from seven hundred eighty seven reviews. "
        "Plumb Masters, with four point eight stars from four hundred forty one reviews. "
        "And Garrett's Plumbing in North Austin, with a perfect five, from just sixty three reviews."),
 dict(kind="compare", title="Same search, same morning",
      left=("about 5 am", "#11", "Closed, opens 7 AM"), right=("about 7:15 am", "#1", "Open"),
      who="O & M Plumbing Services",
      n="Here is the part that surprised us. We ran the same search earlier that morning, at about five. "
        "Back then, O and M Plumbing showed as closed, opening at seven, and it sat at number eleven, outside the top ten. "
        "A little over two hours later, it was open, and it was number one. "
        "We can't see Google's formula. But the timing is hard to ignore. Your hours on Google are not a detail."),
 dict(kind="compare2", title="Reviews help, but they don't decide alone",
      left=("Garrett's Plumbing", "63 reviews", "#3"), right=("Radiant Plumbing", "18K reviews", "#6"),
      n="Second lesson. Reviews matter, but they are not the whole story. "
        "Garrett's Plumbing, with sixty three reviews, ranked third. "
        "Radiant Plumbing, with about eighteen thousand reviews, ranked sixth. "
        "Google says local results are based on three things: relevance, distance, and prominence. Reviews are only part of prominence."),
 dict(kind="three", title="What Google says it looks at",
      items=[("Relevance", "Does your profile match the search?"), ("Distance", "How close you are to the searcher"), ("Prominence", "Reviews, links, how well known you are")],
      cap="Source: Google Business Profile Help, \"Tips to improve your local ranking on Google\"",
      n="Relevance means your profile matches what people search, so your categories and services must be right. "
        "Distance is how close you are to the person searching. You can't change that. "
        "Prominence is how well known you look, online and off. That is where reviews, listings and mentions come in."),
 dict(kind="shot", img="chatgpt.jpg",
      n="Now the same question, asked to ChatGPT. Who is the best plumber in Austin, T X? "
        "ChatGPT's first pick was Austin's Greatest Plumbing. Its second was A B C Home and Commercial.",
      hl=(240, 218, 722, 330), cap="ChatGPT, \"Who is the best plumber in Austin TX?\", asked 15 Nov 2026, about 7:20 am Austin time"),
 dict(kind="list", title="ChatGPT's 5 picks vs Google's top 10",
      rows=[("1", "Austin's Greatest Plumbing", "Google #8", ""),
            ("2", "ABC Home & Commercial", "Google #7", ""),
            ("3", "Plumbing Outfitters", "not in top 10", ""),
            ("4", "Parobek Plumbing & AC", "not in top 10", ""),
            ("5", "Rooter-Man Plumbing", "not in top 10", "")],
      n="Here is what stood out. None of Google's top three made ChatGPT's list of five. "
        "Its top two sat at number seven and number eight on Google. The other three were not in Google's top ten at all. "
        "So winning Google Maps does not mean you win ChatGPT."),
 dict(kind="quote", title="Where did ChatGPT get its picks?",
      lines=["It cited outside list sites, such as ContractorsRanked", "It quoted ratings and review counts from listings", "It said: rankings vary by source"],
      n="So where did ChatGPT get its answer? It pointed to outside list sites, such as Contractors Ranked, plus ratings and review counts from business listings. "
        "It even said that rankings vary by source. In other words, ChatGPT reads what other websites say about you."),
 dict(kind="fixes", title="3 things any plumber can do this week",
      items=["Keep your hours right on Google, and set holiday hours for Thanksgiving and Christmas",
             "Pick the most specific category, Plumber, and list every service you offer",
             "Get listed on trusted directories and best-of lists, with the same name, phone and address everywhere"],
      n="So, three things any plumber can do this week. "
        "One. Keep your hours right on Google, and set your holiday hours for Thanksgiving and Christmas. "
        "Two. Choose the most specific category, and list every service you offer. "
        "Three. Get listed on trusted directories and best of lists, with the same name, phone and address everywhere. "
        "That is what both Google and ChatGPT can read."),
 dict(kind="cta", title="Free: check your Google profile in 2 minutes",
      url="businesssanta.com/google-profile-score",
      n="Want to know where your business stands? Take our free Google profile score. Twelve yes or no questions, a score out of one hundred, and your fixes in order. "
        "It's at business santa dot com. No sign up needed."),
 dict(kind="end",
      n="This was Local Visibility Check, by Business Santa, powered by SEO Season. "
        "Tell us your trade and your city in the comments, and we may check it in a coming episode."),
]
