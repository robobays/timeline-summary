#!/bin/bash

# Start ollama serve as a daemon
nohup ollama serve > ollama-serve.log 2>&1 &

# Wait for ollama serve to be ready
until nc -z localhost 11434; do
  echo "Waiting for ollama serve..."
  sleep 1
done

# Create robobays model
ollama create robobays -f Modelfile

# Start the Node.js application
node ./index.js
