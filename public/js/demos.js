// Demo library on the Portfolio page: category chips, a thumbnail grid (screenshots made by
// tools/shoot_demos.mjs), "I want this design" + "View live site" per demo, and "Show more".
// The list itself lives in demos/demos.json.
import { BRAND } from "./content.js";
import { reduceMotion } from "./ui.js";

const enc = encodeURIComponent;

/** Email to the studio, already filled in, so asking for a design takes one click. */
function wantLink(d) {
  const subject = `I want the ${d.name} design`;
  const body = `Hi Ruddix,\n\nI'd like a website like the ${d.name} design (${d.category}):\n${d.url}\n\nMy business name:\nWhat we do:\nBest way to reach me:\n`;
  return `mailto:${BRAND.email}?subject=${enc(subject)}&body=${enc(body)}`;
}

function card(d) {
  return `
    <li class="demo">
      <a class="demo__shot" href="${d.url}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">
        <span class="demo__bar"><i></i><i></i><i></i><span>${d.name}</span></span>
        <img src="demos/thumbs/${d.id}-600.webp" srcset="demos/thumbs/${d.id}-600.webp 600w, demos/thumbs/${d.id}-1200.webp 1200w"
          sizes="(min-width: 1100px) 31vw, (min-width: 700px) 46vw, 92vw" width="600" height="375" loading="lazy" decoding="async"
          alt="">
      </a>
      <div class="demo__body">
        <p class="demo__cat">${d.category}</p>
        <h3 class="demo__name">${d.name}</h3>
        <div class="demo__actions">
          <a class="btn-solid demo__want" href="${wantLink(d)}">I want this design</a>
          <a class="btn-line demo__live" href="${d.url}" target="_blank" rel="noopener">View live site<span aria-hidden="true"> &nearr;</span><span class="sr-only"> (${d.name}, opens in a new tab)</span></a>
        </div>
      </div>
    </li>`;
}

/**
 * Wire up a `.demos` section: chips, grid and the "Show more" button inside `root`.
 * `first` designs show at the start (and after each filter change), then `pageSize` more per click.
 */
export async function setupDemos(root, { pageSize = 6, first = pageSize } = {}) {
  const list = await (await fetch("demos/demos.json")).json();
  const cats = ["All", ...new Set(list.map((d) => d.category))];
  // "All" deals the categories out in turn (restaurant, cafe, pizza, gym, restaurant...) so the
  // first screen shows every kind of business, not six restaurants in a row
  const byCat = cats.slice(1).map((c) => list.filter((d) => d.category === c));
  const demos = [];
  for (let i = 0; demos.length < list.length; i++) byCat.forEach((g) => g[i] && demos.push(g[i]));
  const chips = root.querySelector(".demos__chips");
  const grid = root.querySelector(".demos__grid");
  const count = root.querySelector(".demos__count");
  const more = root.querySelector(".demos__more");
  let cat = "All", shown = first;

  chips.innerHTML = cats
    .map((c) => {
      const n = c === "All" ? demos.length : demos.filter((d) => d.category === c).length;
      return `<button type="button" class="chip" data-cat="${c}" aria-pressed="${c === cat}">${c} <span class="chip__n">${n}</span></button>`;
    })
    .join("");

  const render = (fromIndex = 0) => {
    const list = cat === "All" ? demos : demos.filter((d) => d.category === cat);
    const visible = list.slice(0, shown);
    grid.innerHTML = visible.map(card).join("");
    const what = cat === "All" ? "designs" : `${cat} designs`;
    count.textContent = visible.length < list.length ? `Showing ${visible.length} of ${list.length} ${what}` : `Showing all ${list.length} ${what}`;
    const left = list.length - visible.length;
    more.hidden = left <= 0;
    more.textContent = `Show more designs (${left} more)`;
    const fresh = [...grid.children].slice(fromIndex);
    if (window.gsap && !reduceMotion) window.gsap.from(fresh, { y: 24, autoAlpha: 0, duration: 0.6, ease: "power3.out", stagger: 0.06, clearProps: "all" });
    return fresh;
  };

  chips.addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b || b.dataset.cat === cat) return;
    cat = b.dataset.cat;
    shown = first;
    chips.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
    render();
  });
  more.addEventListener("click", () => {
    const from = shown;
    shown += pageSize;
    // keyboard and screen-reader users land on the first new design
    render(from)[0]?.querySelector(".demo__want").focus({ preventScroll: true });
  });
  render();
}
