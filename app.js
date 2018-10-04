const express = require('express')
const sqlite3 = require('sqlite3')
const bodyParser = require('body-parser')
const bcrypt = require('bcrypt')

const db = new sqlite3.Database("buddybase.db")

  db.run(`
  CREATE TABLE IF NOT EXISTS accounts(
      accountId INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      password TEXT,
  )
  `)

  db.run(`
  CREATE TABLE IF NOT EXISTS studyStatus(
      studyId INTEGER PRIMARY KEY AUTOINCREMENT,
      accountId INTEGER,
      message VARCHAR,
      createdAt INTEGER,
      latitude FLOAT,
      longitude FLOAT
  )
  `)

  db.run(`
  CREATE TABLE IF NOT EXISTS friends(
  )
  `)

const app = express()

app.get("/", function(req, res){
  res.send("Hello World")
})

app.listen(6000)