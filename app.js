const readline = require("readline");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question("Enter customer feedback: ", function(feedback) {

    const lowerFeedback = feedback.toLowerCase();

    if (
    lowerFeedback.includes("love") ||
    lowerFeedback.includes("great") ||
    lowerFeedback.includes("awesome")
) {
    console.log("Sentiment: Positive");
}
   if (
    lowerFeedback.includes("hate") ||
    lowerFeedback.includes("terrible") ||
    lowerFeedback.includes("bad") ||
    lowerFeedback.includes("frustrated") ||
    lowerFeedback.includes("annoyed") ||
    lowerFeedback.includes("disappointed") ||
    lowerFeedback.includes("difficult") ||
    lowerFeedback.includes("hard") ||
    lowerFeedback.includes("confusing")
) {
    console.log("Sentiment: Negative");
}
    if (
    lowerFeedback.includes("easy") ||
    lowerFeedback.includes("simple") ||
    lowerFeedback.includes("quick")
) {
    console.log("Effort: Low");
} else if (
    lowerFeedback.includes("difficult") ||
    lowerFeedback.includes("hard") ||
    lowerFeedback.includes("multiple times")
) {
    console.log("Effort: High");
}

    if (
        lowerFeedback.includes("crashing") ||
        lowerFeedback.includes("error") ||
        lowerFeedback.includes("bug")
    ) {
        console.log("Category: Technical Issue");

    } else if (
        lowerFeedback.includes("login") ||
        lowerFeedback.includes("log in") ||
        lowerFeedback.includes("sign in") ||
        lowerFeedback.includes("locked out") ||
        lowerFeedback.includes("password") ||
        lowerFeedback.includes("logged in")
    ) {
        console.log("Category: Login Issue");

    } else if (
        lowerFeedback.includes("fee") ||
        lowerFeedback.includes("charge")
    ) {
        console.log("Category: Fees");

    } else if (
        lowerFeedback.includes("branch") ||
        lowerFeedback.includes("wait") ||
        lowerFeedback.includes("line")
    ) {
        console.log("Category: Branch/Service");

    } else if (
        lowerFeedback.includes("card") ||
        lowerFeedback.includes("debit")
    ) {
        console.log("Category: Cards");

    } else {
        console.log("Category: Other");
    }

    rl.close();
});