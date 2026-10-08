-- Troféu Almada em Atletismo (resultados oficiais, importados com tools/trofeu-almada).
create table races (
  id             bigint generated always as identity primary key,
  season         text not null,                -- 2025/2026
  round          int not null,
  name           text not null,                -- nome publicado
  base_name      text not null,                -- nome comparável entre épocas
  race_date      date not null,
  regulation_url text,
  unique (season, round)
);

create table results (
  id            bigint generated always as identity primary key,
  race_id       bigint not null references races (id) on delete cascade,
  athlete_id    uuid references athletes (id) on delete set null,
  athlete_name  text not null,
  birth_year    int,
  category      text not null,
  place         int,
  bib           text,
  time          text,
  time_s        numeric(10, 2),
  distance_m    int,
  trophy_points int,
  team_points   int,
  source_url    text,
  unique (race_id, athlete_name, birth_year)
);
create index results_athlete_idx on results (athlete_id);
