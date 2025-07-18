# AI-Enabled Digital Twin Assurance Challenges

A webpage that displays challenges related to assuring the trustworthiness of AI-enabled digital twin technologies across various sectors.

## Features

- Interactive challenge cards for assurance challenges in AI-enabled digital twin (AI-DT) technologies
- Filter and search challenges by sector, rating scores, and AI-DT capabilities
- **COMING SOON**: community-feedback and voting system for challenges
- **COMING SOON**: additional challenges and resources for AI-DT assurance

> [!IMPORTANT]
> **ADViCE AI Carbon Challenge Cards** 
>
> This repository is based on the original AI Carbon Challenge Cards produced by the AI for Decarbonisation's Virtual Centre for Excellence (ADViCE).
> 
> The original cards are available here: https://es-catapult.github.io/advice-challenge

## Technologies

- HTML5, CSS3, and vanilla JavaScript with jQuery
- Bootstrap 5.3.2
- Font Awesome 6.5.1
- No build system or package manager required

## Getting Started

To run the application locally:

```bash
# Using Python
python -m http.server

# Using Node.js http-server (if installed)
npx http-server
```

Then open your browser to the local address (typically http://localhost:8000).

## Project Structure

- `index.html`: Main application entry point
- `css/style.css`: Styling with sector-specific colors
- `js/main.js`: Core functionality and filtering logic
- `images/`: Contains sector images and icons
- `docs/`: Additional documentation

## Data Structure

- Challenges in `data.json` with properties like number, title, sector, and ratings
- Capabilities defined in `capabilities.json`
- JSON Schema available in `schema.json` for validating the data structure
- Rating system (1-3 stars) for:
  - Significance: Potential impact on digital twin ecosystem
  - Complexity: Technical and organizational difficulty
  - Readiness: Current level of community preparedness

## License

Released under MIT License. See [LICENSE](LICENSE) for details.