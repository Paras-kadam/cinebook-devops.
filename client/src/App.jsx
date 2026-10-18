import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  Film,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Ticket,
  X,
} from "lucide-react";

const currency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
const dateLabel = (
  date,
  options = { weekday: "short", day: "numeric", month: "short" },
) => new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", options);
const duration = (minutes) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
const href = (path) => `#${path}`;
const localToday = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const routeFromHash = () =>
  window.location.hash.slice(1).startsWith("/")
    ? window.location.hash.slice(1)
    : "/";
function decodeReference(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
function navigate(path) {
  window.location.hash = path;
}

async function api(path, options = {}) {
  const unavailable = () => {
    const error = new Error(
      "The cinema service is currently unavailable. Check your connection and try again in a moment.",
    );
    error.code = "API_UNAVAILABLE";
    return error;
  };
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    throw unavailable();
  }
  let data;
  try {
    data = await response.json();
  } catch {
    // A missing API proxy can return the frontend's HTML or an empty 502.
    throw unavailable();
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw unavailable();
  if ([502, 503, 504].includes(response.status)) throw unavailable();
  if ([401, 403].includes(response.status) && !data.error) throw unavailable();
  if (!response.ok) {
    const error = new Error(
      data.error || "Something went wrong. Please try again.",
    );
    error.code = data.code;
    error.status = response.status;
    throw error;
  }
  if (path === "/movies" && !Array.isArray(data.movies)) throw unavailable();
  return data;
}

function useResource(path, refresh = 0) {
  const [state, setState] = useState({
    loading: Boolean(path),
    data: null,
    error: null,
  });
  useEffect(() => {
    let active = true;
    if (!path) {
      setState({ loading: false, data: null, error: null });
      return () => {
        active = false;
      };
    }
    setState({ loading: true, data: null, error: null });
    api(path)
      .then((data) => {
        if (active) setState({ loading: false, data, error: null });
      })
      .catch((error) => {
        if (active) setState({ loading: false, data: null, error });
      });
    return () => {
      active = false;
    };
  }, [path, refresh]);
  return state;
}

function Brand() {
  return (
    <a className="brand" href="#/" aria-label="CineBook home">
      <span className="brand-mark">
        <Film size={22} strokeWidth={1.8} />
      </span>
      <span>
        Cine<span className="brand-light">Book</span>
        <span className="brand-dot">.</span>
      </span>
    </a>
  );
}
function Header({ route }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand />
        <nav aria-label="Main navigation">
          <a href="#/" className={route === "/" ? "active" : ""}>
            Now showing
          </a>
          <a
            href="#/bookings"
            className={route === "/bookings" ? "active" : ""}
          >
            My bookings
          </a>
        </nav>
        <div className="header-right">
          <span className="location">
            <MapPin size={15} /> New Delhi
          </span>
          <span className="demo-badge">
            <i /> Local demo
          </span>
        </div>
      </div>
    </header>
  );
}
function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div>
          <Brand />
          <p>A little escape. A big-screen experience.</p>
        </div>
        <div className="footer-note">
          <span>Made for the love of cinema.</span>
          <p>CineBook is a college demo. No real payments or tickets.</p>
        </div>
        <span className="copyright">
          © {new Date().getFullYear()} CineBook
        </span>
      </div>
    </footer>
  );
}
function Loading({ text = "Setting the scene…" }) {
  return (
    <div className="state-panel" role="status">
      <span className="loader" />
      <h2>{text}</h2>
      <p>Your next big-screen moment is on its way.</p>
    </div>
  );
}
function ErrorPanel({ error, retry }) {
  return (
    <div className="state-panel" role="alert">
      <span className="state-icon">
        <Film />
      </span>
      <h2>A little intermission.</h2>
      <p>{error.message}</p>
      {retry && (
        <button className="button primary" onClick={retry}>
          Try again <ArrowRight size={16} />
        </button>
      )}
      <a className="text-link" href="#/">
        Back to films
      </a>
    </div>
  );
}
function MovieMeta({ movie }) {
  return (
    <div className="movie-meta">
      <span className="rating">
        <Star size={14} fill="currentColor" /> {Number(movie.rating).toFixed(1)}
        <small>/ 10 · Demo rating</small>
      </span>
      <span className="meta-dot" />
      <span>
        <Clock3 size={14} /> {duration(movie.durationMinutes)}
      </span>
      <span className="certificate">{movie.certificate}</span>
    </div>
  );
}

function Hero({ movie }) {
  return (
    <section className="hero" aria-label="Featured movie Beyond Orbit">
      <div className="hero-art" aria-hidden="true" />
      <div className="hero-grain" aria-hidden="true" />
      <div className="hero-content">
        <span className="eyebrow hero-eyebrow">
          <span /> THE BIG SCREEN IS CALLING
        </span>
        <h1>
          BEYOND
          <br />
          <span>ORBIT</span>
          <span className="hero-period">.</span>
        </h1>
        <p className="hero-tagline">Some journeys change everything.</p>
        <p className="hero-description">
          One last mission. A universe of possibilities.
          <br />
          Experience the extraordinary, one seat at a time.
        </p>
        <div className="hero-actions">
          <a
            className={`button primary${movie ? "" : " disabled"}`}
            href={movie ? href(`/movie/${movie.id}`) : "#films"}
          >
            <Ticket size={17} /> Book tickets <ArrowRight size={17} />
          </a>
          <a className="hero-secondary" href="#films">
            Explore films <ArrowDown size={15} />
          </a>
        </div>
        {movie && (
          <div className="hero-meta">
            <span className="hero-rating">
              <Star size={14} fill="currentColor" />{" "}
              {Number(movie.rating).toFixed(1)}
              <small>/10</small>
              <small>Demo rating</small>
            </span>
            <span>{duration(movie.durationMinutes)}</span>
            <span>Sci-Fi · Adventure</span>
            <span className="certificate">{movie.certificate}</span>
          </div>
        )}
      </div>
      <div className="hero-side-note">
        <span className="vertical-label">AN ORIGINAL CINEBOOK EXPERIENCE</span>
        <span className="orbit-coordinate">
          23° 14′ N &nbsp; 87° 42′ E<br />
          SOMEWHERE BEYOND THE KNOWN.
        </span>
      </div>
      <div className="hero-bottom">
        <span>
          <span className="feature-index">01</span>
          <span className="feature-line" />
          <span>THE SPOTLIGHT</span>
        </span>
        <span className="hero-availability">
          <i /> NOW SHOWING IN 2D & IMAX
        </span>
      </div>
    </section>
  );
}

function fallbackPoster(movie) {
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[character],
    );
  const accent = /^#[\da-f]{6}$/i.test(movie.accent)
    ? movie.accent
    : "#a674ff";
  const seed = [...movie.title].reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  );
  const title = movie.title.split(" ");
  const genres = movie.genre || [];
  const midpoint = Math.ceil(title.length / 2);
  const artwork = genres.includes("Romance")
    ? `<path d="M0 380Q110 ${200 + seed % 80} 210 385T420 355V630H0Z" fill="${accent}" opacity=".55"/><circle cx="285" cy="205" r="75" fill="#f7d4ce" opacity=".8"/>`
    : genres.includes("Sci-Fi")
      ? `<circle cx="210" cy="265" r="122" fill="${accent}" opacity=".65"/><ellipse cx="210" cy="265" rx="195" ry="42" fill="none" stroke="#e1c8ff" stroke-width="5" transform="rotate(-${18 + seed % 35} 210 265)"/>`
      : `<path d="M0 425L${100 + seed % 75} 180L270 410L350 260L420 425V630H0Z" fill="${accent}" opacity=".7"/><circle cx="${90 + seed % 220}" cy="160" r="70" fill="${accent}" opacity=".45"/>`;
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="420" height="630" viewBox="0 0 420 630"><defs><linearGradient id="bg" x2=".8" y2="1"><stop stop-color="#171322"/><stop offset="1" stop-color="#08090f"/></linearGradient><linearGradient id="shade" x2="0" y2="1"><stop stop-color="#08090f" stop-opacity="0"/><stop offset="1" stop-color="#08090f"/></linearGradient></defs><rect width="420" height="630" fill="url(#bg)"/>${artwork}<g fill="#fff" opacity=".6"><circle cx="52" cy="86" r="2"/><circle cx="338" cy="102" r="2"/><circle cx="185" cy="55" r="1.5"/></g><rect y="350" width="420" height="280" fill="url(#shade)"/><text x="32" y="468" fill="#e0d4f4" font-family="Arial,sans-serif" font-size="10" letter-spacing="4">A CINEBOOK ORIGINAL</text><text x="30" y="514" fill="#fff" font-family="Arial,sans-serif" font-size="30" font-weight="700">${escape(title.slice(0, midpoint).join(" "))}</text><text x="30" y="552" fill="#fff" font-family="Arial,sans-serif" font-size="30" font-weight="700">${escape(title.slice(midpoint).join(" "))}</text><text x="32" y="600" fill="#c8bcd6" font-family="Arial,sans-serif" font-size="11" letter-spacing="2">${escape(genres.join(" · ").toUpperCase())}</text></svg>`)}`;
}

function MoviePoster({ movie, className, loading, decorative = false }) {
  const [failedSource, setFailedSource] = useState(null);
  return (
    <img
      className={className}
      src={failedSource === movie.poster ? fallbackPoster(movie) : movie.poster}
      alt={decorative ? "" : `Original illustrated poster for ${movie.title}`}
      loading={loading}
      onError={() => setFailedSource(movie.poster)}
    />
  );
}

function MovieCard({ movie, index }) {
  const nextShow = movie.nextShowtimes?.[0];
  return (
    <article
      className="movie-card"
      style={{ "--card-accent": movie.accent, "--index": index }}
    >
      <a
        className="poster-link"
        href={href(`/movie/${movie.id}`)}
        aria-label={`View ${movie.title} and showtimes`}
      >
        <MoviePoster
          className="movie-poster"
          movie={movie}
          loading="lazy"
        />
        <span className="poster-shine" />
        <span className="poster-format">NOW SHOWING</span>
        <span className="poster-book">
          Choose your seat <ArrowUpRight />
        </span>
      </a>
      <div className="card-info">
        <div className="card-rating">
          <Star size={12} fill="currentColor" />
          <strong>
            {Number(movie.rating).toFixed(1)}<small>/10</small>
          </strong>
          <span>Demo rating</span>
          <span className="certificate">{movie.certificate}</span>
        </div>
        <h3>
          <a href={href(`/movie/${movie.id}`)}>{movie.title}</a>
        </h3>
        <div className="card-tags">
          {movie.genre.map((item) => <span key={item}>{item}</span>)}
          <span className="language-badge">{movie.language}</span>
        </div>
        <p className="card-runtime">
          <Clock3 size={12} /> {duration(movie.durationMinutes)}
          <span>·</span> {movie.releaseYear}
        </p>
        <p className="card-description">{movie.synopsis}</p>
        <div className="card-showtimes">
          <span className="card-showtime-label">
            {nextShow ? `Next shows · ${nextShow.date === localToday() ? "Today" : dateLabel(nextShow.date)}` : "Showtimes"}
          </span>
          {movie.nextShowtimes?.length ? (
            <div className="card-showtime-list">
              {movie.nextShowtimes.slice(0, 3).map((show) => (
                <a
                  key={show.id}
                  href={href(`/book/${show.id}`)}
                  aria-label={`Book ${movie.title} on ${dateLabel(show.date)} at ${show.time}`}
                  title={`${show.screen} · ${show.format} · ${currency(show.price)}`}
                >
                  {show.time}
                </a>
              ))}
            </div>
          ) : (
            <span className="card-no-shows">New shows coming soon</span>
          )}
        </div>
        <div className="card-bottom">
          <span className="card-price">
            {Number.isFinite(movie.startingPrice) ? (
              <>
                <small>From</small>
                <strong>{currency(movie.startingPrice)}</strong>
                <small>/ seat</small>
              </>
            ) : "Prices at show selection"}
          </span>
          <a
            href={href(`/movie/${movie.id}`)}
            aria-label={`Showtimes for ${movie.title}`}
          >
            Showtimes <ChevronRight size={14} />
          </a>
        </div>
        <a
          className="button primary card-book-button"
          href={href(`/movie/${movie.id}`)}
          aria-label={`Book tickets for ${movie.title}`}
        >
          <Ticket size={16} /> Book Tickets <ArrowRight size={16} />
        </a>
      </div>
    </article>
  );
}
function ArrowUpRight() {
  return <ArrowRight size={16} style={{ transform: "rotate(-35deg)" }} />;
}

function MovieSkeletons() {
  return (
    <div className="movie-loading" role="status" aria-label="Loading movies">
      <span className="sr-only">Loading movies. Rolling out the red carpet…</span>
      <div className="movie-grid" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <div className="movie-skeleton" key={index}>
            <div className="skeleton-poster skeleton-shimmer" />
            <div className="skeleton-line skeleton-shimmer" />
            <div className="skeleton-line skeleton-line-short skeleton-shimmer" />
            <div className="skeleton-line skeleton-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Home() {
  const [refresh, setRefresh] = useState(0);
  const { data, loading, error } = useResource("/movies", refresh);
  const [genre, setGenre] = useState("All films");
  const [search, setSearch] = useState("");
  const [language, setLanguage] = useState("All languages");
  const [sort, setSort] = useState("featured");
  const movies = data?.movies || [];
  const languages = [
    "All languages",
    ...new Set(movies.map((movie) => movie.language)),
  ];
  const genres = [
    "All films",
    ...new Set(movies.flatMap((movie) => movie.genre)),
  ];
  const visible = movies.filter(
    (movie) =>
      (genre === "All films" || movie.genre.includes(genre)) &&
      (language === "All languages" || movie.language === language) &&
      movie.title.toLowerCase().includes(search.toLowerCase().trim()),
  );
  if (sort === "rating")
    visible.sort((first, second) =>
      second.rating - first.rating || first.title.localeCompare(second.title),
    );
  if (sort === "title-asc")
    visible.sort((first, second) => first.title.localeCompare(second.title));
  if (sort === "title-desc")
    visible.sort((first, second) => second.title.localeCompare(first.title));
  function resetFilters() {
    setSearch("");
    setGenre("All films");
    setLanguage("All languages");
    setSort("featured");
  }
  return (
    <>
      <main>
        <Hero movie={movies[0]} />
        <section className="film-section page-width" id="films">
          <div className="section-heading">
            <div>
              <span className="eyebrow">PICK A STORY. MAKE A MEMORY.</span>
              <h2>
                Now showing<span className="heading-dot">.</span>
              </h2>
              <p>Your next favourite film is a seat away.</p>
            </div>
            <span className="section-count">
              <span>{loading || error ? "—" : String(movies.length).padStart(2, "0")}</span>
              {loading ? "FINDING YOUR NEXT STORY" : error ? "FILMS WILL RETURN SOON" : "STORIES ON THE BIG SCREEN"}
            </span>
          </div>
          <div className="film-toolbar">
            <div className="genre-tabs" role="group" aria-label="Filter films by genre">
              {genres.map((item) => (
                <button
                  key={item}
                  className={item === genre ? "selected" : ""}
                  onClick={() => setGenre(item)}
                  aria-pressed={item === genre}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="film-controls">
              <label className="search-field">
                <Search size={17} />
                <span className="sr-only">Search films</span>
                <input
                  type="search"
                  disabled={loading || Boolean(error)}
                  placeholder="Find your film…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                {search && (
                  <button onClick={() => setSearch("")} aria-label="Clear search">
                    <X size={14} />
                  </button>
                )}
              </label>
              <label className="film-select">
                <span>Language</span>
                <select
                  aria-label="Filter by language"
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  disabled={loading || Boolean(error)}
                >
                  {languages.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label className="film-select">
                <span>Sort by</span>
                <select
                  aria-label="Sort films"
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                  disabled={loading || Boolean(error)}
                >
                  <option value="featured">Featured</option>
                  <option value="rating">Top rated</option>
                  <option value="title-asc">Title A–Z</option>
                  <option value="title-desc">Title Z–A</option>
                </select>
              </label>
            </div>
          </div>
          {!loading && !error && (
            <div className="film-results" aria-live="polite">
              <span>Showing {visible.length} of {movies.length} films</span>
              <span>Original demo films · Sample ratings</span>
            </div>
          )}
          {loading ? (
            <MovieSkeletons />
          ) : error ? (
            <ErrorPanel
              error={error}
              retry={() => setRefresh((value) => value + 1)}
            />
          ) : visible.length ? (
            <div className="movie-grid">
              {visible.map((movie, index) => (
                <MovieCard key={movie.id} movie={movie} index={index} />
              ))}
            </div>
          ) : (
            <div className="state-panel empty-state">
              <Search size={30} />
              <h3>No films found</h3>
              <p>Try a different title, genre or language, or explore all our films.</p>
              <button
                className="button secondary"
                onClick={resetFilters}
              >
                Show all films
              </button>
            </div>
          )}
        </section>
        <section className="cinema-promise page-width">
          <div className="promise-symbol">
            <Sparkles size={24} />
          </div>
          <div>
            <span className="eyebrow">LESS SCROLLING. MORE FEELING.</span>
            <h2>Life looks better on the big screen.</h2>
          </div>
          <a href="#films" className="text-link">
            Find your escape <ArrowRight size={17} />
          </a>
        </section>
      </main>
      <Footer />
    </>
  );
}

function BookingSteps({ current }) {
  return (
    <ol className="booking-steps" aria-label="Booking progress">
      {["Choose a show", "Pick your seats", "Your ticket"].map(
        (label, index) => (
          <li
            key={label}
            className={index <= current ? "reached" : ""}
            aria-current={index === current ? "step" : undefined}
          >
            <span>{index < current ? <Check size={12} /> : index + 1}</span>
            {label}
            {index < 2 && <i />}
          </li>
        ),
      )}
    </ol>
  );
}

function MovieDetail({ id }) {
  const [refresh, setRefresh] = useState(0);
  const movieState = useResource(`/movies/${encodeURIComponent(id)}`, refresh);
  const showState = useResource(
    `/movies/${encodeURIComponent(id)}/showtimes`,
    refresh,
  );
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedShow, setSelectedShow] = useState("");
  const movie = movieState.data?.movie;
  const dates = showState.data?.dates || [];
  const currentDate = dates.includes(selectedDate) ? selectedDate : dates[0];
  const shows = (showState.data?.showtimes || []).filter(
    (show) => show.date === currentDate,
  );
  const picked = shows.find((show) => String(show.id) === String(selectedShow));
  if (movieState.loading)
    return (
      <main className="page-width inner-page">
        <Loading />
      </main>
    );
  if (movieState.error)
    return (
      <main className="page-width inner-page">
        <ErrorPanel
          error={movieState.error}
          retry={() => setRefresh((value) => value + 1)}
        />
      </main>
    );
  return (
    <>
      <main className="page-width inner-page">
        <a href="#/" className="back-link">
          <ArrowLeft size={16} /> All films
        </a>
        <BookingSteps current={0} />
        <div className="detail-layout">
          <div className="detail-poster-wrap">
            <MoviePoster
              className="detail-poster"
              movie={movie}
            />
            <span className="poster-caption">
              <Film size={13} /> A CINEBOOK ORIGINAL
            </span>
          </div>
          <div className="detail-content">
            <span className="eyebrow">YOUR NEXT BIG-SCREEN MOMENT</span>
            <h1>
              {movie.title}
              <span className="heading-dot">.</span>
            </h1>
            <p className="detail-tagline">{movie.tagline}</p>
            <MovieMeta movie={movie} />
            <div className="detail-tags">
              {movie.genre.map((item) => (
                <span key={item}>{item}</span>
              ))}
              <span>{movie.language}</span>
              <span>{movie.releaseYear}</span>
            </div>
            <p className="synopsis">{movie.synopsis}</p>
            <div className="show-picker">
              <div className="picker-heading">
                <div>
                  <span className="eyebrow">MAKE IT A MOVIE NIGHT</span>
                  <h2>Choose your show</h2>
                </div>
                <span className="venue">
                  <MapPin size={14} /> CineBook, New Delhi
                </span>
              </div>
              {showState.loading ? (
                <Loading text="Finding your showtimes…" />
              ) : showState.error ? (
                <ErrorPanel
                  error={showState.error}
                  retry={() => setRefresh((value) => value + 1)}
                />
              ) : (
                <>
                  <div className="date-list" aria-label="Choose a date">
                    {dates.map((date, index) => (
                      <button
                        key={date}
                        className={`date-button${currentDate === date ? " selected" : ""}`}
                        onClick={() => {
                          setSelectedDate(date);
                          setSelectedShow("");
                        }}
                        aria-pressed={currentDate === date}
                      >
                        <span>
                          {date === localToday()
                            ? "TODAY"
                            : dateLabel(date, {
                                weekday: "short",
                              }).toUpperCase()}
                        </span>
                        <strong>{dateLabel(date, { day: "2-digit" })}</strong>
                        <small>{dateLabel(date, { month: "short" })}</small>
                      </button>
                    ))}
                  </div>
                  <div className="showtime-list" aria-label="Choose a showtime">
                    {shows.map((show) => (
                      <button
                        key={show.id}
                        className={`showtime-button${String(selectedShow) === String(show.id) ? " selected" : ""}`}
                        onClick={() => setSelectedShow(show.id)}
                        aria-pressed={String(selectedShow) === String(show.id)}
                      >
                        <strong>{show.time}</strong>
                        <span>
                          {show.format} · {show.screen}
                        </span>
                        <small>{currency(show.price)} / seat</small>
                      </button>
                    ))}
                  </div>
                  {!shows.length && (
                    <p className="inline-note">
                      No shows scheduled for this date. Try another day.
                    </p>
                  )}
                  <div className="show-continue">
                    <span>
                      <ShieldCheck size={16} /> Your next escape, a few clicks
                      away.
                    </span>
                    <button
                      className="button primary"
                      disabled={!picked}
                      onClick={() => navigate(`/book/${picked.id}`)}
                    >
                      Choose seats <ArrowRight size={17} />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

function Seat({ seat, booked, selected, locked, onSelect }) {
  return (
    <button
      className={`seat${booked ? " booked" : ""}${selected ? " selected" : ""}`}
      type="button"
      disabled={booked || locked}
      aria-label={`Seat ${seat}${booked ? ", booked" : selected ? ", selected" : ", available"}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span>{seat.replace(/[A-Z]/g, "")}</span>
    </button>
  );
}

function SeatBooking({ id }) {
  const [refresh, setRefresh] = useState(0);
  const { loading, data, error } = useResource(
    `/showtimes/${encodeURIComponent(id)}/seats`,
    refresh,
  );
  const [selected, setSelected] = useState([]);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const emailId = useId();
  const nameId = useId();
  const showtime = data?.showtime;
  const movieState = useResource(
    showtime ? `/movies/${encodeURIComponent(showtime.movieId)}` : null,
  );
  const movie = movieState.data?.movie;
  const booked = data?.bookedSeats || [];
  useEffect(() => {
    if (data)
      setSelected((seats) =>
        seats.filter((seat) => !data.bookedSeats.includes(seat)),
      );
  }, [data]);
  function toggleSeat(seat) {
    if (submitting) return;
    if (!selected.includes(seat) && selected.length >= 8) {
      setBookingError(
        "You can choose up to 8 seats per booking. Deselect a seat to choose another.",
      );
      return;
    }
    setBookingError("");
    setSelected((seats) =>
      seats.includes(seat)
        ? seats.filter((item) => item !== seat)
        : [...seats, seat].sort((a, b) =>
            a.localeCompare(b, undefined, { numeric: true }),
          ),
    );
  }
  async function book(event) {
    event.preventDefault();
    if (!selected.length || submitting) return;
    if (customerName.trim().length < 2) {
      setBookingError("Enter your full name using at least 2 characters.");
      return;
    }
    setSubmitting(true);
    setBookingError("");
    try {
      const result = await api("/bookings", {
        method: "POST",
        body: JSON.stringify({
          showtimeId: showtime.id,
          seats: selected,
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim(),
        }),
      });
      navigate(`/ticket/${encodeURIComponent(result.booking.reference)}`);
    } catch (failure) {
      setBookingError(failure.message);
      if (failure.status === 409) setRefresh((value) => value + 1);
    } finally {
      setSubmitting(false);
    }
  }
  if (loading)
    return (
      <main className="page-width inner-page">
        <Loading text="Finding your perfect seat…" />
      </main>
    );
  if (error)
    return (
      <main className="page-width inner-page">
        <ErrorPanel
          error={error}
          retry={() => setRefresh((value) => value + 1)}
        />
      </main>
    );
  return (
    <>
      <main className="page-width inner-page">
        <a className="back-link" href={href(`/movie/${showtime.movieId}`)}>
          <ArrowLeft size={16} /> Change show
        </a>
        <BookingSteps current={1} />
        <div className="booking-page-heading">
          <div>
            <span className="eyebrow">THE BEST SPOT IS YOURS TO CHOOSE</span>
            <h1>
              Pick your seats<span className="heading-dot">.</span>
            </h1>
            <p>
              {movie?.title || "Your movie"} <span>·</span>{" "}
              {dateLabel(showtime.date)} <span>·</span> {showtime.time}{" "}
              <span>·</span> {showtime.format}
            </p>
          </div>
          <span className="venue">
            <MapPin size={15} /> CineBook, New Delhi
          </span>
        </div>
        <div className="booking-layout">
          <section className="seat-panel" aria-label="Cinema seat selection">
            <div className="screen">
              <span>THE BIG SCREEN</span>
            </div>
            <p className="seat-instruction">
              A great story deserves a great seat.
            </p>
            <p className="seat-scroll-hint">
              Swipe the seat map to see every seat <ArrowRight size={12} />
            </p>
            <div
              className="seat-scroll"
              tabIndex="0"
              role="region"
              aria-label="Seat map; scroll horizontally on small screens"
            >
              <div
                className="seat-map"
                role="group"
                aria-label="Available seats"
              >
                <div className="seat-number-row">
                  <span />
                  {Array.from({ length: data.seatsPerRow }, (_, index) => (
                    <span
                      key={index}
                      className={index === 4 ? "aisle-after" : ""}
                    >
                      {index + 1}
                    </span>
                  ))}
                  <span />
                </div>
                {data.rows.map((row) => (
                  <div className="seat-row" key={row}>
                    <span className="row-label">{row}</span>
                    {Array.from({ length: data.seatsPerRow }, (_, index) => {
                      const seat = `${row}${index + 1}`;
                      return (
                        <div
                          key={seat}
                          className={
                            index === 4 ? "seat-wrap aisle-after" : "seat-wrap"
                          }
                        >
                          <Seat
                            seat={seat}
                            booked={booked.includes(seat)}
                            selected={selected.includes(seat)}
                            locked={submitting}
                            onSelect={() => toggleSeat(seat)}
                          />
                        </div>
                      );
                    })}
                    <span className="row-label">{row}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="seat-legend">
              <span>
                <i className="legend-available" /> Available
              </span>
              <span>
                <i className="legend-selected" /> Your selection
              </span>
              <span>
                <i className="legend-booked" /> Booked
              </span>
            </div>
            <div className="seat-panel-note">
              <ShieldCheck size={15} />
              <span>
                Choose up to 8 seats. Each seat is {currency(data.price)}.
              </span>
            </div>
            <p className="selection-announcement sr-only" aria-live="polite">
              {selected.length} seats selected. Total{" "}
              {currency(selected.length * data.price)}.
            </p>
          </section>
          <aside className="checkout-panel">
            <span className="eyebrow">YOUR MOVIE NIGHT</span>
            <div className="checkout-film">
              {movie && <MoviePoster movie={movie} decorative />}
              <div>
                <h2>{movie?.title || "Cinema booking"}</h2>
                <p>
                  {dateLabel(showtime.date)} · {showtime.time}
                </p>
                <span>
                  {showtime.screen} <span>·</span> {showtime.format}
                </span>
              </div>
            </div>
            <div className="summary-row">
              <span>
                Seats <small>({selected.length})</small>
              </span>
              <strong>
                {selected.length ? selected.join(", ") : "Pick your favourites"}
              </strong>
            </div>
            <div className="summary-row">
              <span>Ticket price</span>
              <strong>
                {currency(data.price)} × {selected.length}
              </strong>
            </div>
            <div className="summary-total">
              <span>
                Total <small>All inclusive</small>
              </span>
              <strong>{currency(selected.length * data.price)}</strong>
            </div>
            <form onSubmit={book}>
              <div className="form-heading">
                <h3>Who’s joining us?</h3>
                <p>Your ticket details will appear after booking.</p>
              </div>
              <label htmlFor={nameId}>Full name</label>
              <input
                id={nameId}
                autoComplete="name"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="e.g. Alex Sharma"
                required
                minLength={2}
                maxLength={100}
                disabled={submitting}
              />
              <label htmlFor={emailId}>Email address</label>
              <input
                id={emailId}
                autoComplete="email"
                type="email"
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                placeholder="you@example.com"
                required
                maxLength={254}
                disabled={submitting}
              />
              {bookingError && (
                <p className="form-error" role="alert">
                  {bookingError}
                </p>
              )}
              <button
                className="button primary checkout-button"
                disabled={!selected.length || submitting}
                type="submit"
              >
                {submitting ? (
                  <>
                    <span className="button-spinner" /> Booking your seats…
                  </>
                ) : (
                  <>
                    <Ticket size={17} /> Confirm booking{" "}
                    <ArrowRight size={17} />
                  </>
                )}
              </button>
              <p className="checkout-note">
                <ShieldCheck size={13} /> Demo booking. No payment required.
              </p>
            </form>
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}

function TicketPage({ reference }) {
  const [refresh, setRefresh] = useState(0);
  const { loading, data, error } = useResource(
    `/bookings/${encodeURIComponent(reference)}`,
    refresh,
  );
  const [copied, setCopied] = useState(false);
  const booking = data?.booking;
  async function copyReference() {
    try {
      await navigator.clipboard.writeText(booking.reference);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  if (loading)
    return (
      <main className="page-width inner-page">
        <Loading text="Getting your ticket ready…" />
      </main>
    );
  if (error)
    return (
      <main className="page-width inner-page">
        <ErrorPanel
          error={error}
          retry={() => setRefresh((value) => value + 1)}
        />
        <a className="button secondary" href="#/bookings">
          Look up another booking
        </a>
      </main>
    );
  return (
    <>
      <main className="page-width inner-page ticket-page">
        <BookingSteps current={2} />
        <div className="confirmation-heading">
          <span className="success-mark">
            <CheckCheck size={29} />
          </span>
          <span className="booking-success-message" role="status">Booking Successful</span>
          <span className="eyebrow">
            IT’S OFFICIAL. YOU’RE GOING TO THE MOVIES.
          </span>
          <h1>
            Your escape is booked<span className="heading-dot">.</span>
          </h1>
          <p>
            See you at the big screen, {booking.customerName.split(" ")[0]}.
          </p>
        </div>
        <article className="cinema-ticket">
          <div className="ticket-main">
            <MoviePoster
              className="ticket-poster"
              movie={booking.movie}
            />
            <div className="ticket-film">
              <span className="eyebrow">CINEBOOK · E-TICKET</span>
              <h2>{booking.movie.title}</h2>
              <span className="ticket-subline">
                {booking.movie.certificate} <span>·</span>{" "}
                {duration(booking.movie.durationMinutes)} <span>·</span>{" "}
                {booking.showtime.format}
              </span>
              <div className="ticket-data">
                <div>
                  <span>DATE</span>
                  <strong>{dateLabel(booking.showtime.date)}</strong>
                </div>
                <div>
                  <span>TIME</span>
                  <strong>{booking.showtime.time}</strong>
                </div>
                <div>
                  <span>SCREEN</span>
                  <strong>{booking.showtime.screen}</strong>
                </div>
                <div>
                  <span>YOUR SEATS</span>
                  <strong>{booking.seats.join(", ")}</strong>
                </div>
              </div>
              <span className="ticket-venue">
                <MapPin size={13} /> CineBook Cinema, New Delhi
              </span>
            </div>
          </div>
          <div className="ticket-stub">
            <Ticket size={28} />
            <span className="eyebrow">BOOKING REFERENCE</span>
            <strong className="booking-reference">{booking.reference}</strong>
            <button className="copy-reference" onClick={copyReference}>
              {copied ? (
                <>
                  <Check size={13} /> Copied
                </>
              ) : (
                "Copy reference"
              )}
            </button>
            <div className="ticket-barcode" aria-hidden="true" />
            <span className="stub-total">
              {booking.seats.length}{" "}
              {booking.seats.length === 1 ? "seat" : "seats"} <span>·</span>{" "}
              {currency(booking.total)}
            </span>
          </div>
        </article>
        <div className="confirmation-info">
          <ShieldCheck size={18} />
          <p>
            <strong>Keep your reference handy.</strong> Find this ticket anytime
            in <a href="#/bookings">My bookings</a> using the reference above.
            This demo does not send email.
          </p>
        </div>
        <div className="ticket-actions">
          <button className="button secondary" onClick={() => window.print()}>
            Print ticket <Ticket size={16} />
          </button>
          <a className="button primary" href="#/">
            Explore more films <ArrowRight size={17} />
          </a>
        </div>
      </main>
      <Footer />
    </>
  );
}

function BookingLookup() {
  const [reference, setReference] = useState("");
  return (
    <>
      <main className="page-width inner-page lookup-page">
        <a className="back-link" href="#/">
          <ArrowLeft size={16} /> Back to films
        </a>
        <div className="lookup-card">
          <span className="lookup-icon">
            <Ticket size={30} />
          </span>
          <span className="eyebrow">
            YOUR NEXT MOVIE NIGHT, ALL IN ONE PLACE
          </span>
          <h1>
            Let’s find your ticket<span className="heading-dot">.</span>
          </h1>
          <p>
            Good stories are worth coming back to.
            <br />
            Enter your booking reference to see your ticket.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (reference.trim())
                navigate(
                  `/ticket/${encodeURIComponent(reference.trim().toUpperCase())}`,
                );
            }}
          >
            <label htmlFor="booking-reference">Booking reference</label>
            <div className="lookup-input">
              <Ticket size={18} />
              <input
                id="booking-reference"
                type="text"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="e.g. CB-XXXXXXXXXX"
                required
                maxLength={60}
                autoComplete="off"
                spellCheck="false"
              />
              <button className="button primary" type="submit">
                Find booking <ArrowRight size={17} />
              </button>
            </div>
          </form>
          <div className="lookup-hint">
            <ShieldCheck size={15} />
            <span>Your reference is shown on your booking confirmation.</span>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

export default function App() {
  const [route, setRoute] = useState(routeFromHash);
  const mainRef = useRef(null);
  useEffect(() => {
    function routeChanged() {
      setRoute(routeFromHash());
      if (window.location.hash === "#films")
        requestAnimationFrame(() =>
          document.getElementById("films")?.scrollIntoView(),
        );
      else window.scrollTo(0, 0);
    }
    window.addEventListener("hashchange", routeChanged);
    return () => window.removeEventListener("hashchange", routeChanged);
  }, []);
  useEffect(() => {
    function focusHeading() {
      const heading = document.querySelector("main h1");
      if (!heading) return false;
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
      return true;
    }
    if (window.location.hash === "#films")
      requestAnimationFrame(() =>
        document.getElementById("films")?.scrollIntoView(),
      );
    if (focusHeading()) return;
    const observer = new MutationObserver(() => {
      if (focusHeading()) observer.disconnect();
    });
    observer.observe(mainRef.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [route]);
  const parts = route.split("/").filter(Boolean);
  let page;
  if (!parts.length) page = <Home />;
  else if (parts[0] === "movie" && parts[1])
    page = <MovieDetail key={route} id={parts[1]} />;
  else if (parts[0] === "book" && parts[1])
    page = <SeatBooking key={route} id={parts[1]} />;
  else if (
    parts[0] === "ticket" &&
    parts[1] &&
    decodeReference(parts[1]) !== null
  )
    page = <TicketPage key={route} reference={decodeReference(parts[1])} />;
  else if (route === "/bookings") page = <BookingLookup />;
  else
    page = (
      <main className="page-width inner-page">
        <ErrorPanel
          error={
            new Error(
              "This page is between screenings. Choose a film to begin again.",
            )
          }
        />
      </main>
    );
  return (
    <div ref={mainRef}>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          const main = document.querySelector("main");
          main?.setAttribute("tabindex", "-1");
          main?.focus();
        }}
      >
        Skip to content
      </a>
      <Header route={route} />
      {page}
    </div>
  );
}
