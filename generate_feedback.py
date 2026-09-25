import csv
import random

random.seed(42)

feedback = {
    "Login": [
        "I've tried logging in three times and keep getting an error.",
        "I can't get into my account even though my password is correct.",
        "I had to reset my password twice before I could sign in.",
        "The login process was quick and easy.",
        "I keep getting locked out of online banking.",
        "It took several attempts before the system finally let me in.",
        "Getting access to my account shouldn't be this difficult.",
        "I was able to sign in without any problems."
    ],

    "Mobile App": [
        "The mobile app keeps crashing when I check my balance.",
        "The app is easy to use and very convenient.",
        "The app froze while I was trying to make a transfer.",
        "I had to restart the app several times.",
        "The mobile experience is much better than it used to be.",
        "The screen stopped responding while I was viewing transactions.",
        "I finally completed the transfer after restarting the app.",
        "Everything I needed was easy to find in the app."
    ],

    "Branch": [
        "The branch staff was great and very helpful.",
        "I waited almost thirty minutes before someone helped me.",
        "The employee took the time to explain everything.",
        "There were too many people waiting and not enough employees.",
        "My visit was quick and easy.",
        "I stood around for a long time before anyone was available.",
        "The representative made the entire visit easy.",
        "The branch team was friendly and professional."
    ],

    "Fees": [
        "I was charged a fee I didn't expect.",
        "I don't understand why this fee was charged.",
        "The representative clearly explained the fee.",
        "There was a charge on my account that caught me off guard.",
        "I would have made a different decision if the fee had been clearer.",
        "The fees are too high.",
        "I was surprised by the additional charge.",
        "The employee explained the charge and answered my questions."
    ],

    "Cards": [
        "My debit card was declined even though I have money in my account.",
        "My replacement card arrived quickly.",
        "I had trouble activating my new debit card.",
        "The card replacement process was very easy.",
        "My new card took much longer than expected to arrive.",
        "A purchase wouldn't go through even though the card should work.",
        "The representative resolved my card problem quickly.",
        "I don't recognize a transaction on my card."
    ],

    "Lending": [
        "The loan application was confusing and had too many steps.",
        "The loan officer explained all of my options clearly.",
        "I submitted everything and haven't received an update.",
        "Applying for the loan was easier than I expected.",
        "I had to provide the same information multiple times.",
        "I wasn't sure which documents I needed to upload.",
        "The loan process was fast and straightforward.",
        "I expected to hear back sooner about my application."
    ],

    "Call Center": [
        "I waited on hold for a long time before someone answered.",
        "The representative was patient and very helpful.",
        "I was transferred multiple times before reaching the right person.",
        "My issue was resolved on the first call.",
        "I had to explain my problem several times.",
        "The phone representative was professional and knowledgeable.",
        "I got bounced between departments before someone could help.",
        "The person I spoke with solved the issue quickly."
    ],

    "Account Opening": [
        "Opening my account online was quick and easy.",
        "The application was confusing and I had to restart.",
        "I wasn't sure what information I needed to provide.",
        "The account opening process was very smooth.",
        "I spent too much time completing the application.",
        "I got halfway through and had to start over.",
        "The instructions were clear throughout the process.",
        "There were too many steps to open the account."
    ],

    "Transfers": [
        "My transfer didn't go through when I expected.",
        "Moving money between my accounts was easy.",
        "I couldn't figure out how to complete the transfer.",
        "The transfer took longer than expected.",
        "I received an error while trying to move money.",
        "The transfer was completed in just a few clicks.",
        "I had to try several times before the transfer worked.",
        "The money arrived exactly when expected."
    ],

    "Website": [
        "The website was easy to navigate.",
        "I couldn't find the information I needed.",
        "The website took too long to load.",
        "Everything was clearly organized.",
        "I kept getting an error on the website.",
        "I clicked around for several minutes before finding what I needed.",
        "The website made it easy to find the information.",
        "The page froze while I was submitting a form."
    ],

    "Deposits": [
        "My deposit still isn't showing in my account.",
        "Making the deposit was quick and easy.",
        "I wasn't sure when my deposit would be available.",
        "The deposit posted exactly when expected.",
        "I had to contact support about my deposit.",
        "The funds are still pending and I don't know why.",
        "Everything worked perfectly with my deposit.",
        "I expected the money to be available sooner."
    ],

    "Fraud Security": [
        "I appreciated receiving the security alert.",
        "The fraud verification process took too long.",
        "I had difficulty verifying my identity.",
        "The representative helped secure my account quickly.",
        "The security process was easy to understand.",
        "I had to verify my identity multiple times.",
        "The fraud team was extremely helpful.",
        "It took too long to prove that it was really me."
    ]
}

categories = list(feedback.keys())

rows = []

for i in range(1, 501):

    category = random.choice(categories)

    comment = random.choice(feedback[category])

    rows.append([
        i,
        comment
    ])

with open("Member Feedback 500.csv", "w", newline="", encoding="utf-8") as file:

    writer = csv.writer(file)

    writer.writerow([
        "feedback_id",
        "feedback"
    ])

    writer.writerows(rows)

print("DONE!")
print("Created 500 synthetic member comments.")
print("File: Member Feedback 500.csv")