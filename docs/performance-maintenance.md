# Study frontend assets

The main page loads one generated stylesheet assembled from the editable CSS
files listed in `scripts/build-study-css.py`. Their order is significant and
matches the original cascade; keep new stylesheets in the appropriate position.

After changing any listed CSS file, run:

```sh
python3 scripts/build-study-css.py
```

This writes a content-hashed CSS file and updates `index.html`, so returning
visitors receive the changed styles instead of an old cached version. Commit
the source, generated file and HTML together. Run the following to check that
the generated file and its HTML reference are current:

```sh
python3 scripts/build-study-css.py --check
```

Do not edit the generated stylesheet directly. Scripts in `index.html` use
`defer` and still execute in document order; keep that order when updating
their dependencies. The separately hosted toolbox keeps its own stylesheets.
