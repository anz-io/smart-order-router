import express, { Application } from 'express';

import routes from './routes';


const app: Application = express();
const port: number = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;


app.use(express.json())

app.use(routes)


app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
