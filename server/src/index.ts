import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import scriptsRouter from "./routes/scripts";
import scenesRouter from "./routes/scenes";
import commentsRouter from "./routes/comments";
import charactersRouter from "./routes/characters";
import historyRouter from "./routes/history";
import usersRouter from "./routes/users";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "../../data/uploads")));

app.use("/api/scripts", scriptsRouter);
app.use("/api/scenes", scenesRouter);
app.use("/api/comments", commentsRouter);
app.use("/api/characters", charactersRouter);
app.use("/api/history", historyRouter);
app.use("/api/users", usersRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
