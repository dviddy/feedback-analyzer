function analyzeFeedback() {
    const feedback = document.getElementById("feedback").value;

    const lowerFeedback = feedback.toLowerCase();

    let sentiment = "Neutral";
    let effort = "Unknown";
    let category = "Other";
    let priority = "Low";
    let action = "Review feedback";

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
        lowerFeedback.includes("horrible")
    ) {
        sentiment = "Negative";

    } 
    if (
        lowerFeedback.includes("difficult") ||
        lowerFeedback.includes("hard") ||
        lowerFeedback.includes("multiple times")
    ) {
        effort = "High";

}

    else if (
        lowerFeedback.includes("love") ||
        lowerFeedback.includes("great") ||
        lowerFeedback.includes("good")
    ) {
        sentiment = "Positive";
    }

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

    if (
        sentiment === "Negative" && effort === "High" ||
        sentiment === "Negative" && category === "Technical Issue" ||
        sentiment === "Negative" && category === "Login Issue" ||
        sentiment === "Negative" && category === "Fees"
    ) {
        priority = "High";
    }

    document.getElementById("analysis").innerHTML =
    "<p>Category: " + category + "</p>" +
    "<p>Sentiment: " + sentiment + "</p>" +
    "<p>Effort: " + effort + "</p>" +
    "<p class='priority'>Priority: " + priority + "</p>" +
    "<p>Recommended Action: " + action + "</p>";
}