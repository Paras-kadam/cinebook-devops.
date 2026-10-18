export const movies = [
  {
    id: 1,
    title: "Beyond Orbit",
    tagline: "Some journeys take you further than home.",
    synopsis:
      "When a signal arrives from the edge of a forgotten galaxy, a young pilot and a reluctant scientist set out to discover who sent it. What they find will change their understanding of home forever.",
    genre: ["Sci-Fi", "Adventure"],
    durationMinutes: 148,
    certificate: "UA 13+",
    rating: 8.8,
    language: "English",
    slug: "beyond-orbit",
    accent: "#8b5cf6",
    releaseYear: 2026,
    format: "IMAX 2D",
    price: 340,
  },
  {
    id: 2,
    title: "The Last Horizon",
    tagline: "At the edge of the world, a new story begins.",
    synopsis:
      "An unlikely crew crosses an uncharted desert in search of a place that only exists on an old map. With a storm closing in, their greatest discovery may be the courage to trust each other.",
    genre: ["Adventure", "Drama"],
    durationMinutes: 132,
    certificate: "UA 13+",
    rating: 8.5,
    language: "English",
    slug: "the-last-horizon",
    accent: "#f59e0b",
    releaseYear: 2026,
    format: "Dolby Atmos",
    price: 280,
  },
  {
    id: 3,
    title: "Neon District",
    tagline: "Every light hides a secret.",
    synopsis:
      "A night-shift courier receives a delivery with no return address in a city that never turns off its lights. One wrong turn draws her into a mystery that reaches far above the streets she knows.",
    genre: ["Thriller", "Action"],
    durationMinutes: 124,
    certificate: "UA 16+",
    rating: 8.3,
    language: "Hindi",
    slug: "neon-district",
    accent: "#ec4899",
    releaseYear: 2026,
    format: "Dolby Atmos",
    price: 300,
  },
  {
    id: 4,
    title: "Silent Tides",
    tagline: "Some things are only heard when you listen.",
    synopsis:
      "Returning to her seaside hometown, a musician rediscovers an unfinished melody and an old friendship. Through a summer of small discoveries, she learns that moving forward sometimes begins with coming back.",
    genre: ["Drama", "Romance"],
    durationMinutes: 116,
    certificate: "U",
    rating: 8.6,
    language: "English",
    slug: "silent-tides",
    accent: "#22d3ee",
    releaseYear: 2026,
    format: "2D",
    price: 240,
  },
  {
    id: 5,
    title: "Wildfire",
    tagline: "Courage is a spark that never goes out.",
    synopsis:
      "As a wildfire threatens a remote mountain town, a rookie firefighter joins a veteran rescue crew for one extraordinary night. Their mission becomes a moving story of community, sacrifice, and hope.",
    genre: ["Action", "Drama"],
    durationMinutes: 138,
    certificate: "UA 13+",
    rating: 8.4,
    language: "Hindi",
    slug: "wildfire",
    accent: "#f97316",
    releaseYear: 2026,
    format: "Dolby Atmos",
    price: 300,
  },
  {
    id: 6,
    title: "The Midnight Train",
    tagline: "Six strangers. One destination. No way back.",
    synopsis:
      "A delayed overnight train brings six strangers into the same compartment. When an abandoned suitcase begins to ring, their ordinary journey becomes a puzzle that must be solved before the next station.",
    genre: ["Mystery", "Thriller"],
    durationMinutes: 128,
    certificate: "UA 13+",
    rating: 8.7,
    language: "English",
    slug: "the-midnight-train",
    accent: "#a78bfa",
    releaseYear: 2026,
    format: "2D",
    price: 260,
  },
  {
    id: 7,
    title: "Velvet Skies",
    tagline: "Every goodbye leaves a little room for hello.",
    synopsis:
      "An aspiring photographer and a radio host meet during the last monsoon of their college years. As their plans carry them toward different cities, a collection of postcards becomes a promise to find their way back.",
    genre: ["Romance", "Drama"],
    durationMinutes: 122,
    certificate: "UA 13+",
    rating: 8.2,
    language: "Hindi",
    slug: "velvet-skies",
    accent: "#f472b6",
    releaseYear: 2026,
    format: "2D",
    price: 280,
  },
  {
    id: 8,
    title: "The Glass Kingdom",
    tagline: "A fragile world. An unbreakable promise.",
    synopsis:
      "A young mapmaker discovers that the floating kingdom she calls home is slowly turning to glass. With an exiled guardian and a stolen compass, she ventures beyond the clouds to uncover the story that holds their world together.",
    genre: ["Fantasy", "Adventure"],
    durationMinutes: 144,
    certificate: "U",
    rating: 8.9,
    language: "English",
    slug: "the-glass-kingdom",
    accent: "#67e8f9",
    releaseYear: 2026,
    format: "IMAX 2D",
    price: 360,
  },
  {
    id: 9,
    title: "Deep Blue",
    tagline: "Below the surface, nothing stays buried.",
    synopsis:
      "A marine research team follows an unusual sonar signal into an unexplored ocean trench. When their submersible loses contact with the surface, the crew must trust one another to navigate a discovery larger than any of them imagined.",
    genre: ["Adventure", "Thriller"],
    durationMinutes: 130,
    certificate: "UA 13+",
    rating: 8.1,
    language: "English",
    slug: "deep-blue",
    accent: "#38bdf8",
    releaseYear: 2026,
    format: "Dolby Atmos",
    price: 320,
  },
  {
    id: 10,
    title: "Echoes of Tomorrow",
    tagline: "The future has something to tell you.",
    synopsis:
      "A sound engineer restoring an old recording hears a conversation that has not happened yet. Each new message brings her closer to a missing scientist and a choice that could change the next twenty-four hours forever.",
    genre: ["Sci-Fi", "Mystery"],
    durationMinutes: 126,
    certificate: "UA 13+",
    rating: 8.6,
    language: "Hindi",
    slug: "echoes-of-tomorrow",
    accent: "#a78bfa",
    releaseYear: 2026,
    format: "Dolby Atmos",
    price: 300,
  },
];

export const SHOW_TIMES = ["11:00", "15:15", "19:30"];
export const SEAT_ROWS = ["A", "B", "C", "D", "E", "F"];
export const SEATS_PER_ROW = 10;

export function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function showtimeDate(date, time) {
  return new Date(`${date}T${time}:00`);
}

export function upcomingDates(now) {
  const firstDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastShowToday = showtimeDate(
    localDateString(firstDate),
    SHOW_TIMES.at(-1),
  );
  if (lastShowToday <= now) firstDate.setDate(firstDate.getDate() + 1);

  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(firstDate);
    date.setDate(date.getDate() + offset);
    return localDateString(date);
  });
}

export function seedMovies(db) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO movies
      (id, title, tagline, synopsis, genre, duration_minutes, certificate, rating,
       language, poster, backdrop, accent, release_year)
    VALUES
      (@id, @title, @tagline, @synopsis, @genre, @durationMinutes, @certificate,
       @rating, @language, @poster, @backdrop, @accent, @releaseYear)
  `);
  db.transaction(() => {
    for (const movie of movies) {
      insert.run({
        ...movie,
        genre: JSON.stringify(movie.genre),
        poster: `/posters/${movie.slug}.svg`,
        backdrop: `/posters/${movie.slug}.svg`,
      });
    }
  })();
}

export function seedShowtimes(db, now) {
  const dates = upcomingDates(now);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO showtimes
      (movie_id, show_date, start_time, screen, format, price)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  db.transaction(() => {
    for (const movie of movies) {
      for (const date of dates) {
        for (const time of SHOW_TIMES) {
          insert.run(
            movie.id,
            date,
            time,
            `Screen ${movie.id}`,
            movie.format,
            movie.price,
          );
        }
      }
    }
  })();
  return dates;
}
