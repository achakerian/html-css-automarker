import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const EXTRA = `website websites webpage webpages email emails online homepage login logout signup
app apps blog blogs wifi ecommerce checkout faq faqs html css url urls internet smartphone
sportswear activewear streetwear footwear gym fitness workout workouts sneaker sneakers
newsletter socials instagram facebook youtube twitter tiktok linkedin
favourite favourites colour colours colourful customise customised organise organised
realise realised recognise specialise specialised personalise personalised
travelled travelling jewellery centre theatre litre metre metres kilometre kilometres
neighbourhood programme programmes grey honour honours behaviour behaviours
backpack backpacks pickup dropdown lifestyle lifestyles
has women held paid men children feet teeth mice geese wives knives lives halves leaves loaves shelves thieves oxen dice person people said went gone done seen begun drunk sung swum rung wrung torn worn sworn born drawn thrown grown known flown shown risen driven written ridden hidden bitten beaten eaten fallen forgotten given taken mistaken shaken spoken stolen woken broken chosen frozen`.split(/\s+/);

const dict = readFileSync('/usr/share/dict/words', 'utf8').split('\n')
  .filter(w => /^[a-z]+$/.test(w));
const all = [...new Set([...dict, ...EXTRA])].join('\n');
const b64 = gzipSync(Buffer.from(all)).toString('base64');

const html = readFileSync('index.html', 'utf8');
const re = /Automarker\.spellData = "[^"]*";\/\*WORDLIST\*\//;
if (!re.test(html)) { console.error('WORDLIST marker not found'); process.exit(1); }
writeFileSync('index.html', html.replace(re, `Automarker.spellData = "${b64}";/*WORDLIST*/`));
console.log(`Embedded ${all.split('\n').length} words (${Math.round(b64.length / 1024)} KB base64)`);
