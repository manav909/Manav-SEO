/* Business Santa client portal: the accounts we may need, in plain words, with the steps a business owner follows.
   Shared by the client page (Access and connections) and the admin console. Edit ACCESS_EMAIL here if access should go to another address.
   Google only lets you add a person who has a Google Account, so ACCESS_EMAIL must be one. */
window.BSP = {
  ACCESS_EMAIL: "seo@businesssanta.com",
  ITEMS: [
    { key:"gbp", name:"Google Business Profile", short:"Your listing on Google Maps", for:["maps", "reviews"],
      unlocks:["Calls and direction requests from Google Maps", "Searches that show your listing", "Replying to your reviews", "Holiday hours, posts and photos"],
      steps:["Open business.google.com and sign in with the Google account that owns your listing.", "Click the three dots (More), then Business Profile settings, then People and access.", "Click Add, type {email}, choose Manager, then click Invite.", "Come back here and tap \"I've added you\"."],
      link:"https://business.google.com/", linkLabel:"Open Google Business Profile", access:"Manager", mins:3 },
    { key:"gsc", name:"Google Search Console", short:"How Google sees your website", for:["site", "ai", "maps"],
      unlocks:["The searches your website shows up for", "Clicks and your position on Google", "Pages Google has trouble with"],
      steps:["Open search.google.com/search-console and pick your website.", "Click Settings (bottom left), then Users and permissions.", "Click Add user, type {email}, choose Full, then click Add.", "Come back here and tap \"I've added you\"."],
      link:"https://search.google.com/search-console", linkLabel:"Open Search Console", access:"Full user", mins:2 },
    { key:"ga", name:"Google Analytics", short:"Visits to your website", for:["site", "ads", "social"],
      unlocks:["Visitors and where they come from", "Which pages bring calls and form fills", "Results from ads and social posts"],
      steps:["Open analytics.google.com and pick your website's property.", "Click Admin (the gear, bottom left), then Property access management.", "Click the blue +, then Add users. Type {email}, choose Viewer, then click Add.", "Come back here and tap \"I've added you\"."],
      link:"https://analytics.google.com/", linkLabel:"Open Google Analytics", access:"Viewer", mins:3 },
    { key:"web", name:"Your website login", short:"WordPress, Wix, Squarespace, Shopify or other", for:["site", "ai"],
      unlocks:["Fixing titles, speed and the call button for you", "Adding service and city pages", "Keeping your site healthy every week"],
      steps:["Sign in to your website's dashboard the way you normally do.", "Find Users (WordPress: Users, then Add New; Wix: Settings, then Roles and permissions; Squarespace: Settings, then Permissions; Shopify: Settings, then Users).", "Invite {email} as an editor or admin.", "Come back here and tap \"I've added you\". Please never email us a password: inviting us keeps your own login private, and you can remove us any time."],
      link:"", linkLabel:"", access:"Editor or admin", mins:4 },
    { key:"meta", name:"Facebook and Instagram", short:"Your business pages on Meta", for:["social", "ads", "reviews"],
      unlocks:["Posting and scheduling for you", "Views, followers and messages in your report", "Facebook recommendations"],
      steps:["Open business.facebook.com (Meta Business Suite) and pick your business.", "Click Settings, then People, then Add people.", "Type {email}, give access to your Facebook Page and Instagram account (content and insights), then send the invite.", "Come back here and tap \"I've added you\"."],
      link:"https://business.facebook.com/", linkLabel:"Open Meta Business Suite", access:"Content and insights", mins:4 },
    { key:"gads", name:"Google Ads", short:"Only if you run Google ads", for:["ads"],
      unlocks:["Your ad spend, calls and cost per lead", "Tuning ads to bring calls, not clicks"],
      steps:["Open ads.google.com and sign in.", "Click Admin, then Access and security.", "Click the blue +, type {email}, choose Standard, then send the invite.", "Come back here and tap \"I've added you\"."],
      link:"https://ads.google.com/", linkLabel:"Open Google Ads", access:"Standard", mins:2 }
  ],
  /* What the owner can tell us, and what happens next. */
  ANSWERS: {
    added:   { label:"I've added you", reply:"Thank you! We'll confirm the access shortly and switch this to Connected." },
    help:    { label:"I have it, but I'd like help", reply:"No problem. We'll walk you through it on a short call. Pick a time below." },
    notsure: { label:"I'm not sure if I have one", reply:"No worries, that's very common. We'll check for you and tell you what we find." },
    none:    { label:"I don't have one", reply:"That's fine. We'll set it up for you and send one simple step to approve." },
    someone: { label:"Someone else manages it", reply:"Thanks. We'll reach out to them politely and keep you in the loop." },
    skip:    { label:"I'd rather not share this", reply:"Understood. We'll work without it, and the parts that need it will say so." }
  },
  STATUS: {
    connected:{ label:"Connected", cls:"ok" }, checking:{ label:"We're checking", cls:"y" }, ours:{ label:"We're on it", cls:"y" },
    call:{ label:"Call requested", cls:"y" }, issue:{ label:"Needs a quick look", cls:"bad" }, todo:{ label:"Your step", cls:"warn" },
    optional:{ label:"Optional", cls:"n" }, skipped:{ label:"Not shared", cls:"n" }
  }
};
