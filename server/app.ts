require("dotenv").config();
import express, { Express, Request, Response } from "express";
import cors from "cors";
import path from "path";
import router from "./routes";
import { errorHandler } from "./helpers/errorHandler";
import SocketManager from "./listeners/socket";
import cookieParser from "cookie-parser";

const app: Express = express();

const server = app.listen(process.env.PORT);
export { server, app };

app.use(cookieParser());

const socketManager = new SocketManager();
socketManager.init();

app.use(cors());
app.use(express.static(path.join(__dirname, "../../client/dist")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(router);

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../../client/dist/index.html"));
});

app.use(errorHandler);
