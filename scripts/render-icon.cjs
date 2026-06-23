#!/usr/bin/env node

const { readFileSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Resvg } = require('@resvg/resvg-js')

const root = resolve(__dirname, '..')
const input = resolve(root, 'build/icon.svg')
const output = resolve(root, 'build/icon.png')

const svg = readFileSync(input)
const renderer = new Resvg(svg, {
  fitTo: {
    mode: 'width',
    value: 1024
  }
})

writeFileSync(output, renderer.render().asPng())
console.log(`Rendered ${output}`)
