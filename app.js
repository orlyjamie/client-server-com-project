const express = require('express')
const sqlite3 = require('sqlite3')
const bodyParser = require('body-parser')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const db = new sqlite3.Database("studyBuddy.db")
const app = express()

const jwtSecret = "jberjghbehjberj"

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended: true}))

//Foreign keys
db.run("PRAGMA foreign_keys = ON")

//Create the tables
db.run(`
  CREATE TABLE IF NOT EXISTS accounts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE,
      password TEXT
	)
`)

db.run(`
  CREATE TABLE IF NOT EXISTS studyStatus (
		studyId INTEGER PRIMARY KEY AUTOINCREMENT,
		accountId INTEGER,
        message TEXT,
        location INTEGER,
        time INTEGER,
        FOREIGN KEY(\`accountId\`) REFERENCES \`accounts\`(\`id\`) ON DELETE CASCADE
	)
`)

db.run(`
  CREATE TABLE IF NOT EXISTS friends (
		friendId INTEGER PRIMARY KEY AUTOINCREMENT,
		account1 INTEGER,
    account2 INTEGER,
		confirmed INTEGER,
		FOREIGN KEY(\`account1\`) REFERENCES \`accounts\`(\`id\`) ON DELETE CASCADE,
		FOREIGN KEY(\`account2\`) REFERENCES \`accounts\`(\`id\`) ON DELETE CASCADE
	)
`)

db.run(`
  CREATE TABLE IF NOT EXISTS joinF (
		studyId INTEGER PRIMARY KEY AUTOINCREMENT,
		accountId INTEGER,
		FOREIGN KEY(\`accountId\`) REFERENCES \`accounts\`(\`id\`) ON DELETE CASCADE,
		FOREIGN KEY(\`studyId\`) REFERENCES \`studyStatus\`(\`studyId\`) ON DELETE CASCADE
	)
`)

//--------- FUNCTIONS-----------//

//Validate account

function validateaccounts(accounts){
	
	const errors = []
	var letters = /^[a-zA-Z]+$/;

	if(accounts.username.length < 3){
		errors.push("nameTooShort")
	}

	if(15 < accounts.username.length){
		errors.push("nameTooLong")
	}

	if(!accounts.username.match(letters)){
		errors.push("usernameInvalidCharacters")
	}

	return errors

}

//--------- GET REQUESTS-----------//

//Get all studyStatus from friends

app.get("/:account/studyStatus/", function(req, res){
	const account = req.params.account
	const query = "SELECT * FROM studyStatus WHERE accountId IN (SELECT account1 FROM friends WHERE ' " + account + " ' == account2 AND confirmed = 1) OR accountId IN (SELECT account2 FROM friends WHERE ' " + account + " ' == account1 AND confirmed = 1)"
		db.all(query, function(errors, status){
		 if(errors){
				res.status(500).end()
			}else if(status.length < 1){
				res.status(404).end()
			}else{
				res.status(200).json(status)
			}
		})
})

//Get specific studyStatus
app.get("/:account/studyStatus/:id", function(req, res){
	const account = req.params.account
	const id = req.params.id
	const query = "SELECT * FROM studyStatus WHERE studyId = ? AND (accountId IN (SELECT account1 FROM friends WHERE ' " + account + " ' == account2 AND confirmed = 1) OR accountId IN (SELECT account2 FROM friends WHERE ' " + account + " ' == account1 AND confirmed = 1))"
		db.all(query, [id], function(errors, status){
		 if(errors){
				console.log(errors.message)
			} else if(status.length < 1){
				res.status(404).end()
			}
			else{
				res.status(200).json(status)
			}
		})
})

//Get all confirmed friends
app.get("/:account/friends/", function(req, res){
	const account = req.params.account
	const query = "SELECT id, username FROM accounts WHERE id IN (SELECT account1 FROM friends WHERE ' " + account + " ' == account2 AND confirmed = 1) OR id IN (SELECT account2 FROM friends WHERE ' " + account + " ' == account1 and confirmed = 1)"
		db.all(query, function(errors, friends){
		 if(errors){
				res.status(500).end()
			}else if(friends.length < 1){
				res.status(404).end()
			}else{
				res.status(200).json(friends)
			}
		})
})

//Get all friend requests (unconfirmed)
app.get("/:account/friend-requests/", function(req, res){
	const account = req.params.account
	const query = "SELECT id, username FROM accounts WHERE id IN (SELECT account1 FROM friends WHERE ' " + account + " ' == account2 AND confirmed = 0) OR id IN (SELECT account2 FROM friends WHERE ' " + account + " ' == account1 and confirmed = 0)"
		db.all(query, function(errors, friends){
		 if(errors){
				res.status(500).end()
			}else if(friends.length < 1){
				res.status(404).end()
			}else{
				res.status(200).json(friends)
			}
		})
})

//Get specific user
app.get('/accounts/:username', function(req, res){
  const username = req.params.username
  db.get("SELECT id, username FROM accounts WHERE username = ?", [username], function(error, accounts){
    if(error){
      res.status(500).end()
    }else if(accounts.length < 1){
      res.status(404).end()
    }else{
      res.status(200).json(accounts)
  	}
  })
})

//--------- POST REQUESTS-----------//
    
//Create new account

app.post("/accounts", function(req, res){

	const accounts = req.body
	const username = req.body.username
	const password = req.body.password
	const saltRounds = 10
	const theHash = bcrypt.hashSync(password, saltRounds)
	const errors = validateaccounts(accounts)

	if(0 < errors.length){
		res.status(400).json(errors)
		return
	} 

	const query = `
		INSERT INTO accounts (username, password)
		VALUES (?, ?)
		`
	const values = [username, theHash]

	db.run(query, values, function(error){
		if(error){
			if(error.message == "SQLITE_CONSTRAINT: UNIQUE constraint failed: accounts.username"){
				res.status(400).json(["usernameNotUnique"])
			}else{
				res.status(500).end()
			}
		}else{
			res.setHeader("Location", "/accounts/"+this.lastID)
			res.status(201).end()
		}
	})
})

//Sign in

app.post("/tokens", function(req, res){

	const grant_type = req.body.grant_type
	const username = req.body.username
	const password = req.body.password

	const query = `SELECT * FROM accounts WHERE username = ?`
	const values = [username]

	if(grant_type != "password") {
		res.status(400).json({error: "Unsupported_grant_type"})
		return
	} 

	db.get(query, values, function(error, accounts){
		if(error){
			res.status(500).end()
		}else if(!accounts){
			res.status(400).json({error: "invalid_client"})
		}else{
			if(bcrypt.compareSync(password, accounts.password)){
				const accessToken = jwt.sign({accountId: accounts.id}, jwtSecret)
				const idToken = jwt.sign({sub: accounts.id, preferred_username: accounts.username}, jwtSecret)

				res.status(200).json({
					access_token: accessToken,
					token_type: "Bearer",
					id_token: idToken
				})
			}else{
				res.status(400).json({error: "invalid_request"})
			}
		}
	})
})

//Create new studyStatus

app.post("/studyStatus", function(req, res){

	const studyId = req.body.studyId
	const accountId = req.body.accountId
	const message = req.body.message
	const location = req.body.location
	const time = req.body.time
	const authorizationHeader = req.get("Authorization")
	const accessToken = authorizationHeader.substr(7)
	let tokenAccountId = null

	try{
		const payload = jwt.verify(accessToken, jwtSecret)
		tokenAccountId = payload.accountId
	}catch(error){
		res.status(401).end()
		return
	}

	if(tokenAccountId != accountId){
		res.status(401).end()
		return
  }

	const query = `
		INSERT INTO studyStatus (studyId, accountId, message, location, time)
		VALUES (?, ?, ?, ?, ?)
	`
	const values = [studyId, accountId, message, location, time]

	db.run(query, values, function(error){
		if(error){
			if(error.message == "SQLITE_CONSTRAINT: FOREIGN KEY constraint failed"){
				res.status(400).json(["accountNotFound"]) 
			}else {
				res.status(500).end()
			}
		}else{
			const id = this.lastID
			res.setHeader("Location", "/studyStatus/"+id)
			res.status(201).end()
		}
	})
})

//Add friend

app.post("/friends/:account", function(req, res){
	const friendId = req.body.friendId
	const account1 = req.params.account
	const account2 = req.body.accountId
	const confirmed = 0

	const query = "INSERT INTO friends (friendId, account1, account2, confirmed) VALUES (?,?,?,?)"
	const values = [friendId, account1, account2, confirmed]

	db.run(query, values, function(error){
		if(error){
			res.status(422).end()
		} else {
			res.setHeader("Location", "/friends")
			res.status(201).end()
		}
	})
})

//Join friend

app.post("/joinFriend/", function(req, res){
	const studyId = req.body.studyId
	const accountId = req.body.accountId

	const query = "INSERT INTO joinF (studyId, accountId) VALUES (?,?)"
	const values = [studyId, accountId]

	db.run(query, values, function(error){
		if(error){
			res.status(422).end()
		} else {
			res.setHeader("Location", "/joinFriend")
			res.status(201).end()
		}
	})
})

//--------- DELETE REQUESTS-----------//

//Delete studyStatus

app.delete("/studyStatus/:studyId", function(req, res){
	const studyId = parseInt(req.params.studyId)
	db.run("DELETE FROM studyStatus WHERE studyId = ?", [studyId], function(error){
		if(error){
			res.status(500).end()
		}else{
			const numberOfDeletetRows = this.changes
			if(numberOfDeletetRows == 0){
				res.status(404).end()
			}else{
				res.status(204).end()
			}
		}
	})
})

//Delete friendship

app.delete("/friends/:friendId", function(req, res){
	const friendId = parseInt(req.params.friendId)
	db.run("DELETE FROM Friends WHERE friendId = ?", [friendId], function(error){
		if(error){
			res.status(500).end()
		}else {
			const numberOfDeletetRows = this.changes
			if(numberOfDeletetRows == 0){
				res.status(404).end()
			}else{
				res.status(204).end()
			}
		}
	})
})

//Delete account

app.delete("/accounts/:id", function(req, res){
	const id = parseInt(req.params.id)
	db.run("DELETE FROM accounts WHERE id = ?", [id], function(error){
		if(error){
			res.status(500).end()
		}else{
			const numberOfDeletetRows = this.changes
			if(numberOfDeletetRows == 0){
				res.status(404).end()
			}else{
				res.status(204).end()
			}
		}
	})
})

//--------- PUT REQUESTS-----------//

//Update account

app.put("/accounts/:id", function(req, res){
	
	const id = req.params.id
	const accounts = req.body
	const password = req.body.password
	const saltRounds = 10
	const theHash = bcrypt.hashSync(password, saltRounds)


	const errors = validateaccounts(accounts)

	if(0 < errors.length){
		res.status(400).json(errors)
		return
	}

	const query = `
		UPDATE accounts SET username = ?, password = ?
		WHERE id = ?
	`
	const values = [
		accounts.username,
		theHash,
		id
	]
	db.run(query, values, function(error){
		if(error){
			res.status(500).end()
			console.log(error.message)
		}else{
			res.status(204).end()
		}
	})
})

//--------- PATCH REQUESTS-----------//

//Confirm friendship

app.patch("/:account/friends/:friendId", function(req, res){
	const confirmed = req.body.confirmed
	const friendId = parseInt(req.params.friendId)
	db.run("UPDATE friends SET confirmed = ? WHERE friendId = ? ", [friendId], function(error){
		if(error){
			res.status(422).end()
		}else{
			res.status(204).end()
		}
	})
})

app.listen(8080)
