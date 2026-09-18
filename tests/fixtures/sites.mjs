// Fixture site generators for the end-to-end tests. Each function returns a
// { [path]: string | Buffer } object ready for buildZip(). Fixtures are built
// as plain template-literal HTML/CSS so they can be inspected and tweaked by
// hand; bravoFlawed()/foxtrotGaps() are alphaPerfect()/echoPortfolio() clones
// with a small, precisely-described set of string-replace mutations applied.
import { svg } from '../helpers/harness.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildZip } from '../helpers/zipwrite.mjs';

// ---------------------------------------------------------------------------
// CSE1IIT — La Trobe Sports (alphaPerfect / bravoFlawed / charlieMinimal / deltaMessy)
// ---------------------------------------------------------------------------

const PAGES = ['index.html', 'about.html', 'products.html', 'gallery.html', 'contact.html', 'reserve.html'];
// Joined with a literal space so adjacent <a> links don't render as one
// run-on word in innerText (e.g. "indexaboutproducts…") — inline elements
// with no whitespace text node between them concatenate with no gap, which
// the spell-checker would otherwise flag as a single unknown "word".
const nav = (skip = null) => `<nav class="mainnav">${PAGES.filter(p => p !== skip)
  .map(p => `<a href="${p}">${p.split('.')[0]}</a>`).join(' ')}</nav>`;
const CSS = `body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#f2f5f8;color:#1c1c1c}
.mainnav{background:#14406b;padding:10px 16px}
.mainnav a{color:#fff;text-decoration:none;padding:8px 10px;font-size:15px}
header{background:#fff;padding:10px 24px}
main{max-width:960px;margin:0 auto;padding:24px}
section{background:#fff;margin-bottom:28px;padding:20px;min-height:620px}
h1{color:#14406b}h2{color:#e67e22}p{font-size:16px;line-height:1.6}
footer{padding:16px 24px;color:#555}`;
const page = ({ title, navSkip = null, logo = true, backToTop = true, body }) =>
  `<!DOCTYPE html><html><head><title>${title}</title>
  <link rel="stylesheet" href="css/site.css"></head><body id="top">
  <header>${logo ? '<a href="index.html"><img src="img/logo.svg" alt="La Trobe Sports logo" width="140"></a>'
                 : '<strong>La Trobe Sports</strong>'}</header>
  ${nav(navSkip)}<main><h1>${title}</h1>${body}</main>
  <footer>La Trobe Sports${backToTop ? ' — <a href="#top">Back to top</a>' : ''}</footer></body></html>`;
const pic = (name, alt) => `<img src="img/${name}" alt="${alt}" width="300">`;

export function alphaPerfect() {
  const files = {
    'css/site.css': CSS,
    'img/logo.svg': svg(280, 140, '#14406b'),
    'img/map.svg': svg(600, 400, '#7a9'),
  };
  // 'prodhero' is a dedicated image for products.html (kept separate from the
  // shared home-page 'hero' image) so bravoFlawed()'s "bloat one sub-page's
  // hero image" defect can inflate products.html's pageWeight in isolation,
  // without also dragging down the unrelated home page that shares no asset
  // with it.
  for (const n of ['hero', 'prodhero', 'shoes', 'kit', 'shot1', 'shot2', 'bag', 'form'])
    files[`img/${n}.svg`] = svg(600, 400, '#888');
  files['index.html'] = page({ title: 'La Trobe Sports', body: `
    <section><h2>Welcome</h2><p>Welcome to La Trobe Sports, the sport store for
    quality shoes, apparel and training gear. Our team helps every athlete find
    the right footwear and equipment for fitness, recreation and everyday active
    lifestyles, with friendly service and honest advice for all ages. Whether you
    are chasing a personal best on the track, joining a local club, or simply
    want reliable gear for the gym, our staff can help you choose shoes and
    equipment that fit well and last a long time.</p>
    ${pic('hero.svg', 'athletes wearing sport gear')}</section>
    <section><h2>New arrivals and promotions</h2><p>Fresh running shoes and gym
    apparel land weekly, with seasonal promotions and discounts across all
    brands, so there is always something new worth a look when you visit our
    sport store.</p>
    <a href="products.html">Shop now</a></section>` });
  files['about.html'] = page({ title: 'About Us', body: `
    <section><h2>Our story</h2><p>La Trobe Sports started as a small sport shop in
    Bundoora and grew into a full sportswear and equipment store. We stock shoes,
    training apparel and fitness equipment for local sports clubs, students and
    the wider community who love an active lifestyle in every season. Over the
    years we have built relationships with leading sport and footwear brands, so
    our shelves stay full of quality gear at fair prices.</p>
    ${pic('shoes.svg', 'sport shoes on display')}</section>
    <section><h2>Our mission</h2><p>Quality gear, fair prices and honest advice
    for every athlete. We want every visitor, from weekend joggers to serious
    club players, to leave with the right shoes and equipment for their sport.</p>
    ${pic('kit.svg', 'training gear and equipment')}</section>` });
  files['products.html'] = page({ title: 'Products', body: `
    <section><h2>Running shoes and apparel</h2><p>Browse sport shoes, training
    and gym apparel, football and basketball gear, outdoor equipment and fitness
    equipment from leading brands, with sizes for adults and juniors and new
    stock arriving through the season. Our staff can help you find the right fit
    for running, hiking or everyday training.</p>
    ${pic('prodhero.svg', 'running shoes for sport')}</section>
    <section><h2>Bags and equipment</h2>${pic('bag.svg', 'sports bags and backpacks')}
    <p>Backpacks, bottles, socks and recovery gear for every athlete,
    plus a wide range of equipment for training, travel and everyday use.</p></section>` });
  files['gallery.html'] = page({ title: 'Brands and Gallery', body: `
    <section><h2>Featured brands</h2><p>Our gallery shows sportswear collections,
    store displays and seasonal promotions from the sport brands our customers
    love, refreshed with every new arrival of shoes and gear throughout the year.</p>
    ${pic('shot1.svg', 'sportswear collection display')}</section>
    <section><h2>In store</h2>${pic('shot2.svg', 'store interior with sport gear')}
    <p>Drop in to see the full range of shoes, apparel and training equipment
    on display, with friendly staff on hand to help with sizing and advice.</p></section>` });
  files['contact.html'] = page({ title: 'Store Location and Contact', body: `
    <section><h2>Find our store</h2><p>Visit us at 123 Plenty Road, Bundoora VIC 3083.
    Open Mon–Fri 9:00am – 5:30pm and Sat 10:00am – 4:00pm, with plenty of parking
    close to the entrance for a quick and easy visit.</p>
    <img src="img/map.svg" alt="map to our store" width="300"></section>
    <section><h2>Contact details</h2><p>Call (03) 9479 1234 or
    <a href="mailto:hello@latrobesports.example">email the team</a> about stock,
    sizes and sport equipment for your club or fitness plans. Our team is happy
    to help with orders, sizing questions or general advice about gear.</p>
    ${pic('form.svg', 'customer service desk at the sport store')}</section>` });
  files['reserve.html'] = page({ title: 'Product Reservation', body: `
    <section><h2>Reserve your gear</h2><p>Use this form to reserve sport shoes,
    apparel or equipment before you visit. Reservations hold stock for two days
    while you plan your trip to the store, so your size and colour are ready
    and waiting when you arrive.</p>
    ${pic('form.svg', 'reservation form for sport gear')}</section>
    <section><h2>Reservation form</h2>${pic('kit.svg', 'training equipment ready for pickup')}
    <form><label>Name <input></label><label>Email <input></label>
    <label>Product <input></label><button type="submit">Reserve product</button></form></section>` });
  return files;
}

export function bravoFlawed() {
  const files = alphaPerfect();

  // 1. products.html: nav omits the contact.html link.
  files['products.html'] = files['products.html']
    .replace('<a href="contact.html">contact</a>', '');

  // 2. about.html: extra dead link in main.
  files['about.html'] = files['about.html']
    .replace('</main>', '<p><a href="missing.html">old page</a></p></main>');

  // 3. gallery.html: extra broken image (a third image; the 2 good ones still
  // satisfy sub-images).
  files['gallery.html'] = files['gallery.html']
    .replace('</main>', '<p><img src="img/ghost.svg" alt="old gallery shot"></p></main>');

  // 4. index.html: extra absolute/external link.
  files['index.html'] = files['index.html']
    .replace('</main>', '<p><a href="https://facebook.com/latrobesports">Follow us</a></p></main>');

  // 5. contact.html: logo image removed, header keeps the text brand.
  files['contact.html'] = files['contact.html']
    .replace('<a href="index.html"><img src="img/logo.svg" alt="La Trobe Sports logo" width="140"></a>',
      '<strong>La Trobe Sports</strong>');

  // 6. reserve.html: back-to-top anchor removed.
  files['reserve.html'] = files['reserve.html']
    .replace(' — <a href="#top">Back to top</a>', '');

  // 7. index.html: three misspellings appended ("reviews" is fine).
  files['index.html'] = files['index.html']
    .replace('</main>', '<p>We definately recieve teh best reviews.</p></main>');

  // 8. products.html: dedicated hero SVG bloated with a ~5 MB comment payload
  // so only products.html's pageWeight is affected (see the note on
  // 'prodhero' above).
  files['img/prodhero.svg'] = svg(600, 400, '#888')
    .replace('</svg>', `<!--${'x'.repeat(5_000_000)}--></svg>`);

  return files;
}

export function charlieMinimal() {
  const files = {};
  files['index.html'] = `<!DOCTYPE html><html><head><title>My Site</title></head><body>
    <p>This is a small website about my hobbies and interests.</p>
    <p>See the <a href="page1.html">first page</a>, the <a href="page2.html">second page</a>,
    the <a href="page3.html">third page</a> or the <a href="page4.html">fourth page</a> to read more.</p>
  </body></html>`;
  for (const n of [1, 2, 3, 4]) {
    files[`page${n}.html`] = `<!DOCTYPE html><html><head><title>Page ${n}</title></head><body>
      <p>This is page ${n} of my website. There is not much here yet, just a short
      note and no styling at all.</p>
    </body></html>`;
  }
  return files;
}

export function deltaMessy() {
  const alpha = alphaPerfect();
  const files = {};
  for (const [path, data] of Object.entries(alpha)) {
    let renamed = path;
    if (path === 'gallery.html') renamed = 'GALLERY.HTML';
    else if (path === 'about.html') renamed = 'about page.html';
    let content = data;
    if (typeof content === 'string')
      content = content.replace(/href="about\.html"/g, 'href="about%20page.html"');
    files[`My Site Final/${renamed}`] = content;
  }
  // Junk entries the ZipReader must silently discard.
  files['__MACOSX/My Site Final/._index.html'] = svg(1, 1, '#000');
  files['My Site Final/.DS_Store'] = svg(1, 1, '#000');
  return files;
}

// ---------------------------------------------------------------------------
// IWBS001 — personal portfolio (echoPortfolio / foxtrotGaps)
// ---------------------------------------------------------------------------

// A bank of plain, correctly-spelled sentences cycled to hit a target word
// count deterministically (no invented tokens like "word3" — those would trip
// the spell-checker, which is exactly what echoPortfolio() must avoid).
const fillWords = (sentences, targetWords) => {
  let text = '', words = 0, i = 0;
  while (words < targetWords) {
    const s = sentences[i % sentences.length];
    text += (text ? ' ' : '') + s;
    words += s.split(/\s+/).filter(Boolean).length;
    i++;
  }
  return text;
};

const INTRO_SENT = [
  'My name is Jordan Bennett and I am currently studying information technology at university, where I enjoy learning about design, coding and how websites are put together.',
  'I grew up in a small country town before moving to the city to continue my education, and that change taught me to be independent, organised and open to new experiences.',
  'I am generally a calm and patient person, and I try to stay positive even when assignments and deadlines get stressful, which happens quite often during exam season.',
  'Outside of class I enjoy meeting new people, joining group events on campus and finding small ways to make each week a little more interesting than the last.'
];
const BACKGROUND_SENT = [
  'Before university I attended a small local school, where I first grew interested in computers after a teacher showed our class how simple websites were built.',
  'My family has always been supportive of my education, and my parents encouraged me to try new subjects and challenges rather than stick to what felt safe.',
  'Moving away from home for university was a big step, and it taught me how to budget, cook simple meals and manage my own time without much help.',
  'I have worked part time in retail for the past two years, which taught me how to talk to customers, solve problems quickly and stay calm during busy periods.'
];
const HOBBIES_SENT = [
  'In my spare time I love reading novels, especially mystery and history books, and I try to finish at least one new book every month during quieter weeks.',
  'Cooking is another hobby I really enjoy, particularly trying new recipes from different cultures, and I like inviting friends over for dinner once I have learned a new dish.',
  'On weekends you will often find me outdoors, going for a long walk in the park, riding my bicycle along the river trail, or sitting outside with a warm drink.',
  'I have always had a soft spot for photography, and I enjoy taking pictures of nature, old buildings and interesting scenes whenever I travel somewhere new.'
];
const FUNFACTS_SENT = [
  'One fun fact about me is that I once volunteered at a local animal shelter for almost a year, walking dogs and helping with adoption events every weekend.',
  'Another fun fact is that I taught myself a few simple songs on the guitar during the school holidays, even though I never had any formal lessons.',
  'I have visited every state along the coast at least once, and I keep a small journal of the places I have been and the food I tried there.',
  'I am also known among my friends for always having a book in my bag, no matter where I am going or how long I plan to stay.'
];
const SKILLS_SENT = [
  'When it comes to skills, I would say my strongest areas are communication, teamwork and time management, all developed through group projects and part time work.',
  'I have also been building up my computer skills, including basic programming, website design and everyday office software to plan, organise and present my work clearly.',
  'I believe that being willing to learn new things, ask questions and accept feedback are some of the most important skills anyone can have, at university or at work.',
  'Looking ahead, my goal is to finish my degree, gain more experience in web design and eventually work on projects that combine creativity with practical problem solving.'
];
const FAV_SENT = [
  'Reading has always been one of my favourite ways to relax, and I especially enjoy books that mix mystery with a bit of comedy to keep things light.',
  'I try to visit the library at least once a month to borrow new books, and I like asking the staff there for recommendations based on what I recently enjoyed.',
  'Music keeps me company throughout the day, whether I am studying, cooking or simply relaxing at home with a warm drink in hand.',
  'I picked up the guitar a few years ago and although I am still far from an expert, I enjoy learning a new song every few weeks.',
  'Drawing and sketching are creative outlets I turn to when I want to switch off from screens and just focus on something simple and calming.',
  'Staying active is important to me, so I try to go for a run or a long walk most mornings before the day gets too busy.',
  'On weekends I often ride my bicycle along the river trail near my house, which is a lovely way to clear my head and get some fresh air.',
  'I also enjoy swimming during the warmer months, and I try to get to the local pool at least once a week when the weather allows.',
  'Cooking new recipes is another favourite activity, and I especially like trying dishes from cultures I have not cooked before, even when they do not turn out perfectly.',
  'Spending time with friends and family is something I value highly, and we often get together for board games, dinners or a simple catch up over coffee.'
];
const PLACE_SENT = [
  'One of my favourite places in the whole world is a small coastal town called Sunset Bay, which I have been visiting with my family since I was a young child.',
  'The town sits right along the coast, with a long stretch of sand, gentle waves and a calm, relaxed atmosphere that makes it easy to forget about everyday stress.',
  'Every morning during our visits, we like to walk along the shore before breakfast, watching the sun rise slowly over the water while the town is still quiet.',
  'There is a small pier near the centre of town where local fishers sell fresh catch each morning, and the smell of the sea always reminds me of childhood holidays.',
  'A short walk from the beach takes you into a quiet forest trail, filled with tall trees, native birds and a peaceful stream that runs alongside the path.',
  'In the evenings the whole sky turns shades of orange and pink, which is exactly why the town earned its name, and it never gets old to watch.',
  'The local coffee shop in town serves the best breakfast I have ever had, with fresh bread, fruit and coffee that always tastes better with a view of the water.',
  'During summer the town gets busy with more visitors, but it still keeps its relaxed and friendly feel, with locals happy to chat and share recommendations with new visitors.',
  'I look back on so many happy times from that place, from building sand castles as a child to long conversations with family on quiet evenings near the water.',
  'I hope to keep visiting Sunset Bay for many years to come, and one day I would love to share that same peaceful place with a family of my own.'
];

const EPAGES = ['index.html', 'favourites.html', 'place.html'];
const ELABEL = { 'index.html': 'Home', 'favourites.html': 'Favourites', 'place.html': 'My Place' };
const eNav = () => `<nav>${EPAGES.map(p => `<a href="${p}">${ELABEL[p]}</a>`).join(' ')}</nav>`;

const ECSS = `body{margin:0;font-family:'Segoe UI',Verdana,sans-serif;background:#f7f5f2;color:#222}
main{max-width:700px;margin:0 auto;padding:16px}
p{color:#333;line-height:1.6}
.card{background:#fff;border-radius:8px;padding:14px;margin:12px 0}
.accent{color:#2a6f97;font-weight:600}
.wide{max-width:100%}
h2.title{color:#173047}
p.lead{font-weight:600}
li.item{margin:4px 0}
h1{font-size:28px;color:#173047}
h2{font-size:22px;color:#173047}
h3{font-size:18px;color:#2a6f97}
a:hover{color:#e0607e}
h1,h2{margin:0 0 10px}
p,li{margin:0 0 8px}
main p{max-width:65ch}
button{background:#2a6f97;color:#fff;border:0;padding:8px 18px;border-radius:4px}
.gallery{display:flex;gap:10px}`;

const eStyle = () => `<style>
  #page-title{color:#173047}
  header nav{display:flex;gap:14px}
  header nav a{color:#fff;text-decoration:none;padding:6px 10px}
  p.intro{font-style:italic;color:#45607a}
  main{position:relative}
  header{background:#173047;color:#fff;padding:10px 16px;display:flex;justify-content:space-between;align-items:center}
  footer{background:#173047;color:#fff;padding:14px 16px;text-align:center}
  body{margin:0;font-family:'Segoe UI',Verdana,sans-serif;background:#f7f5f2;color:#222}
</style>`;

const eHeader = () => `<header><a class="brand" href="index.html">My Portfolio</a>${eNav()}</header>`;
const eFooter = () => `<footer><p>Thanks for visiting my portfolio.</p></footer>`;

const ePage = (title, body) => `<!DOCTYPE html><html><head><title>${title}</title>
  <link rel="stylesheet" href="css/style.css">${eStyle()}</head><body>
  ${eHeader()}<main>${body}</main>${eFooter()}</body></html>`;

export function echoPortfolio() {
  const files = {
    'css/style.css': ECSS,
    'img/photo.svg': svg(400, 400, '#2a6f97'),
    'img/thing.svg': svg(400, 300, '#e0607e'),
    'img/place.svg': svg(400, 300, '#7a9'),
    'clip.mp4': Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]),
  };

  files['index.html'] = ePage('My Portfolio — Home', `
    <h1 id="page-title">Welcome to My Portfolio</h1>
    <p class="intro">Hello, and thank you for visiting my personal website.</p>
    <div class="card" style="border:1px solid #ddd">
      <video src="clip.mp4" controls width="320"></video>
      <blockquote>&quot;The best way to get started is to quit talking and begin doing.&quot; — Walt Disney</blockquote>
    </div>
    <p><span style="font-weight:bold">Name:</span> Jordan Bennett —
    <span style="color:#2a6f97">Student ID: 21234567</span></p>
    <p style="text-align:center"><img src="img/photo.svg" alt="a photo of me" width="200"></p>
    <p>Send me an email any time at <a href="mailto:student@uni.edu.au">email me</a>,
    or read more about my home city on <a href="https://en.wikipedia.org/wiki/Melbourne">Wikipedia</a>.</p>
    <section><h2 class="title">About Me</h2><p>I am an <span class="accent">enthusiastic</span>
    student who loves learning new things. ${fillWords(INTRO_SENT, 140)}</p></section>
    <section><h2>My Background</h2><p>${fillWords(BACKGROUND_SENT, 140)}</p></section>
    <section><h2>Hobbies</h2><p class="lead">${fillWords(HOBBIES_SENT, 130)}</p></section>
    <section><h2>Fun Facts</h2><div class="wide"><p>${fillWords(FUNFACTS_SENT, 120)}</p></div></section>
    <section><h2>Skills</h2><ul><li class="item">Communication</li>
    <li class="item">Teamwork</li><li class="item">Time management</li></ul>
    <p>${fillWords(SKILLS_SENT, 140)}</p>
    <button type="button">View my resume</button></section>`);

  files['favourites.html'] = ePage('My Portfolio — Favourites', `
    <h1 id="page-title">My Favourite Things and Activities</h1>
    <p class="intro">Here is a bit more about the things I enjoy doing most.</p>
    <div class="card" style="padding:8px">
      <div class="gallery">
        <img src="img/thing.svg" alt="something I enjoy" width="120">
        <img src="img/photo.svg" alt="me enjoying an activity" width="120">
      </div>
    </div>
    <p>Learn more about this hobby on
    <a href="https://en.wikipedia.org/wiki/Photography">Wikipedia</a>.</p>
    <section><h2 class="title">Reading and Music</h2><p>${fillWords(FAV_SENT.slice(0, 3), 190)}</p></section>
    <section><h2>Creativity</h2><p class="lead">${fillWords(FAV_SENT.slice(3, 6), 190)}
    <span style="font-style:italic">These are a few of my favourite ways to unwind.</span></p></section>
    <section><h2>Staying Active</h2><h3>Outdoor Activities</h3>
    <p style="margin-top:16px">${fillWords(FAV_SENT.slice(6), 190)}</p></section>`);

  files['place.html'] = ePage('My Portfolio — My Place', `
    <h1 id="page-title">My Favourite Place</h1>
    <p class="intro">Every family has a place they return to, and this is mine.</p>
    <div class="card" style="text-align:center">
      <img src="img/place.svg" alt="Sunset Bay coastline" width="300">
    </div>
    <p>Read more about the kind of scenery I love on
    <a href="https://en.wikipedia.org/wiki/Coast">Wikipedia</a>.</p>
    <section><h2 class="title">Sunset Bay</h2><p>${fillWords(PLACE_SENT.slice(0, 4), 190)}</p></section>
    <section><h2>Why I Love It</h2><p class="lead">${fillWords(PLACE_SENT.slice(4, 7), 190)}</p></section>
    <section><h2>Memories</h2><p style="margin-top:16px">${fillWords(PLACE_SENT.slice(7), 190)}
    <span style="font-weight:600">Sunset Bay</span> will always be my favourite place.</p></section>`);

  return files;
}

export function foxtrotGaps() {
  const files = echoPortfolio();

  // a:hover rule deleted.
  files['css/style.css'] = files['css/style.css'].replace('a:hover{color:#e0607e}\n', '');

  // .ghost{color:pink} added (unused — matches no element on any page).
  files['css/style.css'] += '\n.ghost{color:pink}';

  // .wide class deleted from the CSS and its HTML usage (leaves 2 generic classes).
  files['css/style.css'] = files['css/style.css'].replace('.wide{max-width:100%}\n', '');
  files['index.html'] = files['index.html'].replace('<div class="wide">', '<div>');

  // .gallery display changed from flex to block (kills flexbox).
  files['css/style.css'] = files['css/style.css'].replace('.gallery{display:flex;gap:10px}',
    '.gallery{display:block;gap:10px}');

  // place.html's <span style> removed (2 inline styles + no span there).
  files['place.html'] = files['place.html']
    .replace(/\s*<span style="font-weight:600">Sunset Bay<\/span> will always be my favourite place\./,
      ' Sunset Bay will always be my favourite place.');

  return files;
}

// ---------------------------------------------------------------------------

export function writeDemoZips(dir) {
  mkdirSync(dir, { recursive: true });
  for (const [name, fn] of Object.entries(
    { alphaPerfect, bravoFlawed, charlieMinimal, deltaMessy, echoPortfolio, foxtrotGaps })) {
    writeFileSync(join(dir, `${name}.zip`),
      buildZip(Object.entries(fn()).map(([path, data]) => ({ path, data }))));
  }
}
