import React from "react";
import { render, useInput, Box, Text } from "ink";

function App() {
  useInput((char, key) => {
    process.stderr.write(
      `CHAR=${JSON.stringify(char)} RET=${key.return} CTRL_C=${key.ctrl && char === "c"}\n`
    );
    if (key.return || (key.ctrl && char === "c")) process.exit(0);
  });
  return <Text>waiting</Text>;
}

render(<App />);
