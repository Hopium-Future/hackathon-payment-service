module.exports = {
    apps : [{
      name: "na3-payment",
      script: 'server.js',
             node_args: "--max-old-space-size=4496",
            interpreter: "/home/nami/.nvm/versions/node/v18.20.5/bin/node"
    }]
  };