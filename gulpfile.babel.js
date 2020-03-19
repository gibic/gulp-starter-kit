import gulp from 'gulp'
import fs from 'fs'
import gulpif from 'gulp-if'
import browserSync from 'browser-sync'
import sourcemaps from 'gulp-sourcemaps'
import imagemin from 'gulp-imagemin'
import imageminMozjpeg from 'imagemin-mozjpeg'
import imageminPngquant from 'imagemin-pngquant'
import yaml from 'js-yaml'
import sass from 'gulp-sass'
import postcss from 'gulp-postcss'
import cleancss from 'gulp-clean-css'
import autoprefixer from 'autoprefixer'
import rollup from 'gulp-better-rollup'
import babel from 'rollup-plugin-babel'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import uglify from 'gulp-uglify'
import gulpStylelint from 'gulp-stylelint'
import gulpEslint from 'gulp-eslint'
import purgecss from 'gulp-purgecss'
import gzip from 'gulp-gzip'
import RevAll from 'gulp-rev-all'
import RevDelete from 'gulp-rev-delete-original'

// Check for "--production" flag
const PRODUCTION = !!(process.env.NODE_ENV === 'production')

// Load settings from config.yml file
function loadConfig () {
  const configFile = fs.readFileSync('config.yml')
  return yaml.load(configFile)
}
const { PATHS, PORT, PURGECSS } = loadConfig()

// Compile SCSS into CSS
// In production CSS is prefixed and compressed
function css () {
  return gulp.src('src/assets/scss/app.scss')
    .pipe(sourcemaps.init())
    .pipe(sass({ includePaths: PATHS.sassLibs }).on('error', sass.logError))
    .pipe(gulpif(!PRODUCTION, sourcemaps.write('.')))
    .pipe(gulp.src(PATHS.additionalCssFiles2Copy, { since: gulp.lastRun(css) }))
    .pipe(gulp.dest(`${PATHS.dist}/assets/css`))
}

// Stylelint for CSS & SCSS
function stylelint (done) {
  return gulp.src('src/**/*.{css,scss}')
    .pipe(gulpStylelint({ failAfterError: true, reporters: [{ formatter: 'string', console: true }] })
      .on('error', done))
}

// Remove unused CSS
function cleanUnusedCSS () {
  return gulp.src(`${PATHS.dist}/**/*.css`)
    .pipe(postcss([autoprefixer({ cascade: false })]))
    .pipe(cleancss())
    .pipe(purgecss({
      content: [`${PATHS.dist}/**/*.{html,js}`],
      whitelist: PURGECSS.whitelist,
      whitelistPatterns: PURGECSS.whitelistPatterns,
      whitelistPatternsChildren: PURGECSS.whitelistPatternsChildren
    }))
    .pipe(gulp.dest(PATHS.dist))
}

// Compress assets
function compressAssets () {
  return gulp.src(`${PATHS.dist}/**/*.{css,js,html}`)
    .pipe(gzip({ extension: 'gzip' }))
    .pipe(gulp.dest(PATHS.dist))
}

// Revisioning files
function revFiles () {
  return gulp.src(`${PATHS.dist}/**/*.{css,html,js}`)
    .pipe(RevAll.revision({ dontRenameFile: ['.html'], dontUpdateReference: ['.html'] }))
    .pipe(RevDelete())
    .pipe(gulp.dest(PATHS.dist))
}

// Eslint for JS
function eslint (done) {
  return gulp.src('src/**/*.js')
    .pipe(gulpEslint())
    .pipe(gulpEslint.format('stylish'))
    .pipe(gulpEslint.failAfterError()).on('error', done)
}

// Compile JS and transform with Babel
// In production JS is compressed
function js () {
  return gulp.src('src/assets/js/app.js')
    .pipe(sourcemaps.init())
    .pipe(rollup({ plugins: [resolve(), commonjs(), babel({ exclude: 'node_modules/**' })] }, 'umd'))
    .pipe(gulpif(!PRODUCTION, sourcemaps.write('.')))
    .pipe(gulpif(PRODUCTION, uglify()))
    .pipe(gulp.src(PATHS.additionalJsFiles2Copy, { since: gulp.lastRun(js) }))
    .pipe(gulp.dest(`${PATHS.dist}/assets/js`))
}

// Copy files from the "src/assets" folder
// but skips the "img", "js", and "scss" folder
function copyAssets () {
  return gulp.src(PATHS.assets, { nodir: true })
    .pipe(gulp.dest(`${PATHS.dist}/assets`))
}

// Copy static files to "dist" folder
function copyStaticFiles () {
  return gulp.src(PATHS.staticFiles, { allowEmpty: true })
    .pipe(gulp.dest(PATHS.dist))
}

// Copy images
// In production images are compressed
function images () {
  return gulp.src(PATHS.images)
    .pipe(gulpif(PRODUCTION,
      imagemin([
        imageminMozjpeg({ quality: 80 }),
        imageminPngquant({ quality: [0.5, 0.8] }),
        imagemin.svgo({ plugins: [{ removeViewBox: true }, { cleanupIDs: false }] })
      ])))
    .pipe(gulp.dest(`${PATHS.dist}/assets`))
}

// Start a server with Browsersync
function server (done) {
  browserSync.init({
    server: PATHS.dist, port: PORT, open: false, notify: false
  }, done)
}
// Reload the browser with Browsersync
function liveReload (done) {
  browserSync.reload()
  done()
}

// Watch for file changes and run tasks
function watchFiles (done) {
  gulp.watch(PATHS.assets, copyAssets)
  gulp.watch(PATHS.staticFiles, copyStaticFiles)
  gulp.watch('src/assets/scss/**/*.{css,scss}', gulp.series(css, stylelint, liveReload))
  gulp.watch('src/assets/js/**/*.js', gulp.series(js, eslint, liveReload))
  gulp.watch('src/assets/img/**/*', gulp.series(images, liveReload))
  gulp.watch(['src/**/*.{html,md,njk}', 'src/**/*.json'], liveReload)
  done()
}

// Export tasks which can be used later with "gulp taskname"
exports.default = gulp.series(
  eslint, stylelint,
  gulp.parallel(copyAssets, copyStaticFiles, images, css, js),
  server, watchFiles
)
exports.build = gulp.series(
  eslint, stylelint,
  gulp.parallel(copyAssets, copyStaticFiles, images, css, js),
  cleanUnusedCSS, revFiles, compressAssets
)
