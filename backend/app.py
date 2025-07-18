from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
from datetime import datetime

app = Flask(__name__)
CORS(app)

client = MongoClient("mongodb://localhost:27017")
db = client["sig_challenges_db"]
collection = db["feedbacks"]

@app.route('/feedback', methods=['POST'])
def collect_feedback():
    data = request.get_json()
    data["timestamp"] = datetime.utcnow().isoformat()
    result = collection.insert_one(data)
    return jsonify({
        "status": "success",
        "message": "Feedback saved to MongoDB!",
        "id": str(result.inserted_id)
    })

@app.route('/', methods=['GET'])
def home():
    return "MongoDB Flask backend is running!"

if __name__ == '__main__':
    app.run(debug=True)