# Fixtures de los importadores

Reconstruidos a partir del formato documentado de cada export —las columnas
de los CSV de IMDb y Letterboxd, y la forma de los ítems de la API de
Trakt—, con datos inventados. **No son exports reales**: cuando haya uno a
mano, conviene reemplazarlos (anonimizando los datos) y volver a correr los
tests, que es lo que confirma que las columnas son las de hoy.

- `imdb-ratings.csv`: "Tus puntajes", con el formato de 2023 en adelante
  (`Original Title`, tipos como `TV Series`).
- `imdb-watchlist.csv`: una lista ("Para ver"), con el formato anterior
  (sin `Original Title`, tipos como `tvSeries`).
- `letterboxd/`: los cinco CSV que se leen del ZIP de Letterboxd.
- `trakt/`: un archivo por cosa, con los ítems de `/sync/*` de la API.
