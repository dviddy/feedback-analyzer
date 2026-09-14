console.log("BROWSER.JS LOADED");

function analyzeFeedback(feedback) {
    const lowerFeedback = feedback.toLowerCase();

    let sentiment = "Neutral";
    let effort = "Unknown";
    let category = "Other";
    let priority = "Low";
    let action = "Review feedback";

    // Sentiment
    if (
        lowerFeedback.includes("bad") ||
        lowerFeedback.includes("hate") ||
        lowerFeedback.includes("dislike") ||
        lowerFeedback.includes("frustrated") ||
        lowerFeedback.includes("annoyed") ||
        lowerFeedback.includes("disappointed") ||
        lowerFeedback.includes("difficult") ||
        lowerFeedback.includes("hard") ||
        lowerFeedback.includes("confusing") ||
        lowerFeedback.includes("terrible") ||
        lowerFeedback.includes("awful") ||
        lowerFeedback.includes("worst") ||
        lowerFeedback.includes("error") ||
        lowerFeedback.includes("horrible") ||
        lowerFeedback.includes("crashing")  
    ) {
        sentiment = "Negative";
    } else if (
        lowerFeedback.includes("love") ||
        lowerFeedback.includes("great") ||
        lowerFeedback.includes("good")
    ) {
        sentiment = "Positive";
    }

    // Effort
    if (
        lowerFeedback.includes("difficult") ||
        lowerFeedback.includes("hard") ||
        lowerFeedback.includes("confusing") ||
        lowerFeedback.includes("frustrating") ||
        lowerFeedback.includes("annoying") ||
        lowerFeedback.includes("time-consuming") ||
        lowerFeedback.includes("complicated") ||
        lowerFeedback.includes("tedious") ||
        lowerFeedback.includes("multiple steps") ||
        lowerFeedback.includes("multiple attempts") ||
        lowerFeedback.includes("three times") ||
        lowerFeedback.includes("multiple times")
    ) {
        effort = "High";
    }

    // Category
    if (
        lowerFeedback.includes("crashing") ||
        lowerFeedback.includes("error") ||
        lowerFeedback.includes("bug")
    ) {
        category = "Technical Issue";
        action = "Investigate the technical issue";

    } else if (
        lowerFeedback.includes("login") ||
        lowerFeedback.includes("log in") ||
        lowerFeedback.includes("logged in") ||
        lowerFeedback.includes("sign in") ||
        lowerFeedback.includes("locked out") ||
        lowerFeedback.includes("password")
    ) {
        category = "Login Issue";
        action = "Review the login experience";

    } else if (
        lowerFeedback.includes("fee") ||
        lowerFeedback.includes("charge")
    ) {
        category = "Fees";
        action = "Review the fee or charge concern";

    } else if (
        lowerFeedback.includes("branch") ||
        lowerFeedback.includes("wait") ||
        lowerFeedback.includes("line")
    ) {
        category = "Branch/Service";
        action = "Review the branch or service experience";

    } else if (
        lowerFeedback.includes("card") ||
        lowerFeedback.includes("debit")
    ) {
        category = "Cards";
        action = "Review the card or debit experience";
    }

    // Priority
    if (
        (sentiment === "Negative" && effort === "High") ||
        (sentiment === "Negative" && category === "Technical Issue") ||
        (sentiment === "Negative" && category === "Login Issue") ||
        (sentiment === "Negative" && category === "Fees")
    ) {
        priority = "High";
    }

    return {
        category: category,
        sentiment: sentiment,
        effort: effort,
        priority: priority,
        action: action
};
}

function analyzeCSV() {
    const fileInput = document.getElementById("csvFile");
    const file = fileInput.files[0];

    if (!file) {
        alert("Please choose a CSV file first.");
        return;
    }

    const reader = new FileReader();

    reader.onload = function(event) {
        const csvText = event.target.result;

        const rows = csvText
            .split("\n")
            .filter(row => row.trim() !== "")
            .map(row => row.split(",")[0].trim());

        const feedbackRows = rows.slice(2);
        
        console.log("Feedback rows:", feedbackRows);

        console.log("Analyzing first comment:", feedbackRows[0]);

        const results = [];

        feedbackRows.forEach(function(comment,index) {
            console.log("Analyzing comment #" + (index + 1) + ":", comment);

            const result = analyzeFeedback(comment);

            results.push(result);
            
            console.log("Analysis result:", result);
});

document.getElementById("analysis").innerHTML = "";

results.forEach(function(result, index) {
    document.getElementById("analysis").innerHTML +=
        "<div class='insight'>" +
        "<strong>Comment " + (index + 1) + "</strong>" +
        "<div>Category: " + result.category + "</div>" +
        "<div>Sentiment: " + result.sentiment + "</div>" +
        "<div>Effort: " + result.effort + "</div>" +
        "<div>Priority: " + result.priority + "</div>" +
        "<div>Recommended Action: " + result.action + "</div>" +
        "</div>";
});        

alert("Feedback comments found: " + feedbackRows.length);   
    };

    reader.readAsText(file);
}