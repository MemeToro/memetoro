# Agent Data Sources

Data-source connectors collect public signals for the MemeToro agent. They provide evidence for later trend analysis and meme-concept generation; they do not propose launch terms or interact with contributor funds.

## Connectors

- [`news-x-trends/`](./news-x-trends/) collects recent worldwide-news coverage through Perplexity Sonar and current X conversation signals through xAI's X Search.

Connector output is untrusted input. Future agent stages must validate it, preserve source links, distinguish reported facts from model analysis, and avoid treating popularity as proof that a token should launch.

Never commit API keys or populated environment files.
