"""
Common password blocklist.

Contains the top 200 most common passwords (lowercase) used to prevent
users from choosing easily guessable passwords. Checked during password
validation in app_schemas._validate_password_strength().
"""

COMMON_PASSWORDS: frozenset[str] = frozenset({
    "password", "123456", "12345678", "qwerty", "abc123",
    "monkey", "master", "dragon", "111111", "baseball",
    "iloveyou", "trustno1", "sunshine", "princess", "football",
    "shadow", "superman", "michael", "password1", "123456789",
    "1234567", "12345", "1234", "123", "letmein",
    "welcome", "admin", "login", "passw0rd", "starwars",
    "solo", "qwerty123", "ashley", "mustang", "bailey",
    "passw0rd", "charlie", "donald", "qwertyuiop", "lovely",
    "jessica", "654321", "michael1", "ashley1", "access",
    "jordan", "jennifer", "thomas", "hunter", "michelle",
    "daniel", "maggie", "amanda", "joshua", "nicole",
    "pepper", "robert", "matthew", "andrew", "george",
    "harley", "ranger", "batman", "soccer", "hockey",
    "buster", "ginger", "killer", "summer", "tigger",
    "andrew1", "flower", "cookie", "turtle", "andrea",
    "taylor", "justin", "jasmine", "hannah", "brandon",
    "samantha", "heather", "jordan1", "alexander", "william",
    "freedom", "thunder", "hammer", "yankees", "dallas",
    "sparky", "peanut", "morgan", "diamond", "silver",
    "oliver", "phoenix", "jackson", "chelsea", "orange",
    "bandit", "marina", "purple", "biteme", "merlin",
    "computer", "internet", "corvette", "camaro", "matrix",
    "angel", "cheese", "winner", "snoopy", "midnight",
    "golfer", "gandalf", "service", "red123", "junior",
    "falcon", "golfing", "yamaha", "diablo", "qazwsx",
    "mother", "fucker", "toyota", "guitar", "maverick",
    "chicken", "robert1", "dakota", "eagles", "tigers",
    "cougar", "knight", "iceman", "mercedes", "compaq",
    "london", "coffee", "music", "panther", "cowboys",
    "johnson", "rocket", "gandhi", "arsenal", "redsox",
    "asdfgh", "zxcvbn", "abcdef", "qweasd", "aaaaaa",
    "121212", "696969", "000000", "112233", "abc",
    "password123", "iloveu", "secret", "princess1", "master1",
    "dragon1", "michael!", "password!", "monkey1", "shadow1",
    "sunshine1", "football1", "trustno1!", "welcome1", "hello",
    "charlie1", "donald1", "jennifer1", "jordan23", "baseball1",
    "superman1", "ashley12", "jessica1", "letmein1", "starwars1",
    "qwerty1", "bailey1", "mustang1", "hunter1", "pepper1",
    "matthew1", "buster1", "killer1", "batman1", "soccer1",
    "flower1", "samantha1", "summer1", "password2", "test",
    "pass", "love", "god", "whatever", "qwert",
    "liverpool", "888888", "changeme", "matrix1", "trustno",
    "samsung", "pokemon", "master12", "soccer12", "nothing",
    "creative", "p@ssw0rd", "pa$$word", "passwd", "p@ssword",
})
