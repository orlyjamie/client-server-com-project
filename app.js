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
		joinFriends INTEGER,
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

//Get all studyStatus

app.get("/studyStatus", function(req, res){
const query = "SELECT * FROM studyStatus"
    db.all(query, function(errors, studyStatus){
        if(errors){
            res.status(500).end()
            }else{
            res.status(200).json(studyStatus)
        }
    })
})

//Get all friends


app.get("/friends", function(req, res){
const accountId = currentUser
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

    const query = "SELECT * FROM friends WHERE confirmed == 1"
        db.all(query, function(errors, friends){
            if(errors){
				res.status(500).end()
                }else{
					
				res.status(200).json(friends)
            }
        })
	}) 
	
//Get specific studyStatus

app.get('/studyStatus/:studyId', function(request, response){
const studyId = parseInt(request.params.studyId)
	db.get("SELECT * FROM studyStatus WHERE studyId = ?", [studyId], function(error, studyStatus){
		if(error){
                response.status(500).end()
            }else if(!studyStatus){
                response.status(404).end()
            }else{
                response.status(200).json(studyStatus)
		}
	})
})

//Get specific account

app.get('/accounts/:username', function(request, response){
    const username = request.params.username
        db.get("SELECT id, username FROM accounts WHERE username = ?", [username], function(error, accounts){
            if(error){
                response.status(500).end()
            }else if(!accounts){
                response.status(404).end()
            }else{
                response.status(200).json(accounts)
        }
    })
})

//--------- POST REQUESTS-----------//
    
//Create new account

app.post("/accounts", function(request, response){

const accounts = request.body
const username = request.body.username
const password = request.body.password
const saltRounds = 10
const theHash = bcrypt.hashSync(password, saltRounds)
const errors = validateaccounts(accounts)

	if(0 < errors.length){
		response.status(400).json(errors)
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
				response.status(400).json(["usernameNotUnique"])
			}else{
				response.status(500).end()
			}
		}	
		else{
			response.setHeader("Location", "/accounts/"+this.lastID)
			response.status(201).end()
		}
	})

})

//Sign in
var currentUser

app.post("/tokens", function(request, response){
	
	const grant_type = request.body.grant_type
	const username = request.body.username
	const password = request.body.password

	const query = `SELECT * FROM accounts WHERE username = ?`
	const values = [username]

	if(grant_type != "password") {
		response.status(400).json({error: "Unsupported_grant_type"})
		return
	} 

	db.get(query, values, function(error, accounts){
		if(error){
			response.status(500).end()
		}else if(!accounts){
			response.status(400).json({error: "invalid_client"})
		}else{
			if(bcrypt.compareSync(password, accounts.password)){

				const accessToken = jwt.sign({accountId: accounts.id}, jwtSecret)
				const idToken = jwt.sign({sub: accounts.id, preferred_username: accounts.username}, jwtSecret)
				currentUser = accounts.id

				response.status(200).json({
					access_token: accessToken,
					token_type: "Bearer",
					id_token: idToken
					
				})

			}else{
				response.status(400).json({error: "invalid_request"})
			}
		}
	})

})

//Create new studyStatus

app.post("/studyStatus", function(request, response){

const studyStatus = request.body
const studyId = request.body.studyId
const accountId = request.body.accountId
const message = request.body.message
const location = request.body.location
const time = request.body.time
const authorizationHeader = request.get("Authorization")
const accessToken = authorizationHeader.substr(7)
let tokenAccountId = null

	try{
		const payload = jwt.verify(accessToken, jwtSecret)
		tokenAccountId = payload.accountId
	}catch(error){
		response.status(401).end()
		return
	}

	if(tokenAccountId != accountId){
		response.status(401).end()
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
				response.status(400).json(["accountNotFound"]) 
			} else {
			response.status(500).end()}
		}else{
			const id = this.lastID
			response.setHeader("Location", "/studyStatus/"+id)
			response.status(201).end()
		}
	})

})

//Add friend

app.post("/friends/:username", function(req, res){
	const account1 = currentUser
	const account2 = req.params.username

	const query = "INSERT INTO Friends (account1, account2, confirmed) VALUES (?,?,0)"
	const values = [account1, account2, confirmed]

	db.run(query, values, function(error){
		if(error){
			res.status(422).end()
		} else {
			res.setHeader("Location", "/friends")
			res.status(201).end()
		}
	})
})

//--------- DELETE REQUESTS-----------//

//Delete studyStatus

app.delete("/studyStatus/:studyId", function(request, response){
	const studyId = parseInt(request.params.studyId)
	db.run("DELETE FROM studyStatus WHERE studyId = ?", [studyId], function(error){
		if(error){
			response.status(500).end()
		}else{
			const numberOfDeletetRows = this.changes
			if(numberOfDeletetRows == 0){
				response.status(404).end()
			}else{
				response.status(204).end()
			}
		}
	})
})

//Delete friendship

app.delete("/friends/:id", function(req, res){
	const id = parseInt(req.params.id)
	db.run("DELETE FROM friends WHERE id = ?", [id], function(error){
		if(error){
			res.status(500).end()
		}else {
			const numberOfDeletetRows = this.changes
			if(numberOfDeletetRows == 0){
				response.status(404).end()
			}else{
				response.status(204).end()
			}
		}
	})
})

//Delete account

app.delete("/accounts/:id", function(request, response){
	const id = parseInt(request.params.id)
	db.run("DELETE FROM accounts WHERE id = ?", [id], function(error){
		if(error){
			response.status(500).end()
		}else{
			const numberOfDeletetRows = this.changes
			if(numberOfDeletetRows == 0){
				response.status(404).end()
			}else{
				response.status(204).end()
			}
		}
	})
})

//--------- PUT REQUESTS-----------//

//Update account

app.put("/accounts/:id", function(request, response){
	
	const id = request.params.id
	const accounts = request.body
	const password = request.body.password
	const saltRounds = 10
	const theHash = bcrypt.hashSync(password, saltRounds)


	const errors = validateaccounts(accounts)

	if(0 < errors.length){
		response.status(400).json(errors)
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
			response.status(500).end()
			console.log(error.message)
		}else{
			response.status(204).end()
		}
	})
})

//--------- PATCH REQUESTS-----------//

//Confirm friendship

app.patch("/friends/:id", function(req, res){
	const id = parseInt(request.params.id)
	db.run("UPDATE friends SET confirmed = 1 WHERE id = ? ", [id], function(error){
		if(error){
			res.status(422).end()
		}else{
			res.status(201).end()
			console.log("created")
		}
	})
})

app.listen(8080)
