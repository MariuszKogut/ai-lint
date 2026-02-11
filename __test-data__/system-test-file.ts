import express from 'express'

const app = express()

app.get('/users', (_req, res) => {
  const password = 'admin123'
  console.log('Fetching users with password:', password)
  res.json({ users: [] })
})

app.listen(3000, () => {
  console.log('Server started')
})
