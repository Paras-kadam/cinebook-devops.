import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

mkdirSync(".artifacts", { recursive: true });

const currency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

async function loadMoviePosters(page) {
  for (const poster of await page.locator(".movie-poster").all()) {
    // Visit each card so native lazy loading also fetches middle rows on mobile.
    await poster.scrollIntoViewIfNeeded();
    await expect.poll(() => poster.evaluate(
      (image) => image.complete && image.naturalWidth > 0,
    )).toBe(true);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
}

test("browse, select seats, confirm, look up the ticket, and prevent a second reservation", async ({
  page,
  request,
}) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".movie-card")).toHaveCount(10);
  await loadMoviePosters(page);
  await page.screenshot({
    path: ".artifacts/home-desktop.png",
    fullPage: true,
    animations: "disabled",
  });

  await page.getByRole("searchbox", { name: "Search films" }).fill("Neon");
  await expect(page.locator(".movie-card")).toHaveCount(1);
  await expect(page.locator(".movie-card h3")).toHaveText("Neon District");
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.locator(".movie-card")).toHaveCount(10);

  await page.getByRole("link", { name: "Book tickets", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your show" }),
  ).toBeVisible();
  await expect(page.locator(".date-button")).toHaveCount(7);
  await page.locator(".showtime-button").first().click();
  await expect(page.locator(".skip-link")).not.toBeFocused();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: ".artifacts/movie-details.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Choose seats" }).click();
  await expect(
    page.getByRole("heading", { name: "Pick your seats." }),
  ).toBeVisible();
  const showtimeId = Number(page.url().split("/book/")[1]);
  const availability = await request.get(`/api/showtimes/${showtimeId}/seats`);
  expect(availability.ok()).toBe(true);
  const { price } = await availability.json();
  const confirm = page.getByRole("button", { name: "Confirm booking" });
  await expect(confirm).toBeDisabled();
  const first = page
    .getByRole("button", { name: /^Seat [A-F]\d+, available$/ })
    .first();
  const seatLabel = await first.getAttribute("aria-label");
  const seat = seatLabel.match(/^Seat ([A-F]\d+)/)[1];
  await first.click();
  await expect(
    page.getByRole("button", { name: `Seat ${seat}, selected`, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: `Seat ${seat}, selected`, exact: true }),
  ).toHaveCSS("background-color", "rgb(156, 104, 232)");
  const second = page
    .getByRole("button", { name: /^Seat [A-F]\d+, available$/ })
    .first();
  const secondLabel = await second.getAttribute("aria-label");
  const secondSeat = secondLabel.match(/^Seat ([A-F]\d+)/)[1];
  await second.click();
  await expect(page.locator(".summary-total strong")).toHaveText(
    currency(price * 2),
  );
  await page.getByLabel("Full name", { exact: true }).fill("Demo Student");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("student@example.com");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: ".artifacts/seat-selection.png",
    fullPage: true,
    animations: "disabled",
  });
  await confirm.click();
  await expect(
    page.getByRole("heading", { name: "Your escape is booked." }),
  ).toBeVisible();
  await expect(page.getByText("Booking Successful", { exact: true })).toBeVisible();
  const reference = await page.locator(".booking-reference").textContent();
  expect(reference).toMatch(/^CB-[A-F0-9]{24}$/);
  await expect(page.locator(".ticket-data")).toContainText(seat);
  await expect(page.locator(".ticket-data")).toContainText(secondSeat);
  const saved = await request.get(`/api/bookings/${reference}`);
  expect(saved.ok()).toBe(true);
  const { booking } = await saved.json();
  expect(booking.seats).toEqual([seat, secondSeat]);
  expect(booking.total).toBe(price * 2);
  await expect(page.getByRole("button", { name: "Print ticket" })).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: ".artifacts/booking-confirmation.png",
    fullPage: true,
    animations: "disabled",
  });

  const duplicate = await request.post("/api/bookings", {
    data: {
      showtimeId,
      seats: [seat],
      customerName: "Second Student",
      customerEmail: "second@example.com",
    },
  });
  expect(duplicate.status()).toBe(409);
  expect((await duplicate.json()).code).toBe("SEAT_UNAVAILABLE");

  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "My bookings", exact: true })
    .click();
  await page.getByLabel("Booking reference", { exact: true }).fill(reference);
  await page.getByRole("button", { name: "Find booking" }).click();
  await expect(page.locator(".booking-reference")).toHaveText(reference);
  await page.reload();
  await expect(page.locator(".booking-reference")).toHaveText(reference);

  await page.goto(`/#/book/${showtimeId}`);
  await expect(
    page.getByRole("button", { name: `Seat ${seat}, booked`, exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: `Seat ${secondSeat}, booked`, exact: true }),
  ).toBeDisabled();
  expect(pageErrors).toEqual([]);
});

test("the real catalogue shows ten distinct posters, demo ratings, prices, and bookable showtimes", async ({
  page,
  request,
}) => {
  const response = await request.get("/api/movies");
  expect(response.ok()).toBe(true);
  const { movies } = await response.json();
  expect(movies).toHaveLength(10);
  await page.goto("/#films");
  const cards = page.locator(".movie-card");
  await expect(cards).toHaveCount(10);
  await expect(page.locator(".section-count")).toContainText("10");
  const posterPaths = await cards.locator(".movie-poster").evaluateAll(
    (images) => images.map((image) => image.getAttribute("src")),
  );
  expect(new Set(posterPaths).size).toBe(10);
  expect(posterPaths.every((path) => path.startsWith("/posters/"))).toBe(true);

  for (const movie of movies) {
    const card = cards.filter({
      has: page.getByRole("heading", { name: movie.title, exact: true }),
    });
    await expect(card).toHaveCount(1);
    await expect(card.locator(".card-rating")).toContainText(/demo rating/i);
    await expect(card).toContainText(movie.language);
    await expect(card.locator(".card-price")).toContainText(currency(movie.startingPrice));
    await expect(
      card.getByRole("link", { name: `Book tickets for ${movie.title}` }),
    ).toHaveAttribute("href", `#/movie/${movie.id}`);
    const showtimes = card.locator(".card-showtimes a");
    expect(await showtimes.count()).toBeGreaterThan(0);
    await expect(showtimes.first()).toHaveAttribute("href", `#/book/${movie.nextShowtimes[0].id}`);
  }

  await cards
    .filter({ has: page.getByRole("heading", { name: "The Glass Kingdom", exact: true }) })
    .getByRole("link", { name: "Book tickets for The Glass Kingdom" })
    .click();
  await expect(page.getByRole("heading", { name: "The Glass Kingdom.", exact: true })).toBeVisible();
  await expect(page.locator(".showtime-button").first()).toBeVisible();
});

test("title search, genre and language filters, empty-state recovery, and sorting work together", async ({
  page,
}) => {
  await page.goto("/#films");
  const cards = page.locator(".movie-card");
  const titles = page.locator(".movie-card h3");
  const search = page.getByRole("searchbox", { name: "Search films" });
  const language = page.getByRole("combobox", { name: "Filter by language" });
  const sort = page.getByRole("combobox", { name: "Sort films" });
  await expect(cards).toHaveCount(10);

  await page.locator(".genre-tabs").getByRole("button", { name: "Romance", exact: true }).click();
  await expect(cards).toHaveCount(2);
  await language.selectOption({ label: "Hindi" });
  await expect(titles).toHaveText(["Velvet Skies"]);
  await search.fill("Silent");
  await expect(cards).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "No films found" })).toBeVisible();
  await page.getByRole("button", { name: "Show all films" }).click();
  await expect(cards).toHaveCount(10);
  await expect(search).toHaveValue("");
  await expect(language).toHaveValue("All languages");

  await language.selectOption({ label: "Hindi" });
  await expect(cards).toHaveCount(4);
  await search.fill("  eChOeS  ");
  await expect(titles).toHaveText(["Echoes of Tomorrow"]);
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(cards).toHaveCount(4);
  await language.selectOption({ label: "All languages" });
  await expect(cards).toHaveCount(10);

  await sort.selectOption({ label: "Title A–Z" });
  const alphabetical = await titles.allTextContents();
  expect(alphabetical).toEqual([...alphabetical].sort((a, b) => a.localeCompare(b)));
  await sort.selectOption({ label: "Title Z–A" });
  await expect(titles).toHaveText([...alphabetical].reverse());
  await sort.selectOption({ label: "Top rated" });
  const ratings = (await cards.locator(".card-rating strong").allTextContents()).map(Number.parseFloat);
  expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
  await expect(titles.first()).toHaveText("The Glass Kingdom");
});

test("a slow real catalogue request shows poster skeletons before the movies arrive", async ({
  page,
}) => {
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  await page.route("**/api/movies", async (route) => {
    await waiting;
    await route.continue();
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("status", { name: "Loading movies" })).toBeVisible();
    await expect(page.locator(".movie-skeleton").first()).toBeVisible();
    await expect(page.locator(".movie-card")).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.locator(".movie-card")).toHaveCount(10);
});

test("a missing poster recovers to illustrated local artwork with its movie title", async ({
  page,
}) => {
  await page.route("**/posters/beyond-orbit.svg", (route) =>
    route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" }),
  );
  await page.goto("/#films");
  const poster = page.locator(".movie-card").first().locator(".movie-poster");
  await poster.scrollIntoViewIfNeeded();
  await expect(poster).toHaveAttribute("src", /^data:image\/svg\+xml,/);
  await expect(poster).toHaveAttribute("alt", /Beyond Orbit/);
  await expect.poll(() => poster.evaluate(
    (image) => image.complete && image.naturalWidth > 0,
  )).toBe(true);
});

for (const [name, status, contentType, body] of [
  ["an unavailable API returning HTML", 503, "text/html", "<h1>Service unavailable</h1>"],
  ["an unrelated service returning an unauthorized response", 401, "application/json", JSON.stringify({ message: "Unauthorized" })],
]) {
  test(`${name} explains the problem and allows retrying the real API`, async ({ page }) => {
    const fail = (route) => route.fulfill({ status, contentType, body });
    await page.route("**/api/movies", fail);
    await page.goto("/#films");
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("A little intermission.");
    await expect(alert).toContainText(/cinema service|cinema API/i);
    await expect(page.locator(".movie-card")).toHaveCount(0);
    await page.unroute("**/api/movies", fail);
    await alert.getByRole("button", { name: "Try again" }).click();
    await expect(page.locator(".movie-card")).toHaveCount(10);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}

for (const [name, width, height] of [
  ["small-mobile", 320, 740],
  ["mobile", 390, 844],
  ["tablet", 768, 1024],
  ["desktop", 1440, 1000],
]) {
  test(`the ${name} layout has loaded artwork and no horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator(".movie-card")).toHaveCount(10);
    await loadMoviePosters(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.artifacts/home-${name}.png`,
      fullPage: true,
    });
    await page.getByRole("link", { name: "Book tickets", exact: true }).click();
    await page.locator(".showtime-button").first().click();
    await page.getByRole("button", { name: "Choose seats" }).click();
    await expect(page.locator(".seat-map")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test("anchor navigation, browser Back, and malformed ticket links remain usable", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#films");
  await expect(page.locator(".movie-card")).toHaveCount(10);
  await page.getByRole("link", { name: "Showtimes for Beyond Orbit" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your show" }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.locator(".movie-card")).toHaveCount(10);
  await page.goto("/#/ticket/%");
  await expect(page.getByRole("alert")).toBeVisible();
  expect(errors).toEqual([]);
});
