export interface ParsedResume {
  name: string;
  email: string;
  phone: string;
  skills: string[];
  experience: string;
  projects: string;
  education: string;
}

export function structuredResumeParser(text: string): ParsedResume {

  // Normalize text
  text = text.replace(/\r/g, "");

  // Remove empty lines
  const lines = text
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0);

  
  // Name
  

  const name = lines[0] || "";

  
  // Email
  

  const email =
    text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0] || "";

  // Phone

  const phone =
    text.match(/(?:\+91[-\s]?)?[6-9]\d{9}/)?.[0] || "";

  // Skills
  
  const skillsSection =
    text.match(
      /(?:Skills|Technical Skills|Key Skills|Core Competencies|Technologies)([\s\S]*?)(?:Experience|Work Experience|Professional Experience|Projects|Education|Certifications|Languages|Achievements|$)/i
    )?.[1] || "";

  const skills = skillsSection
    .split(/\n|,|\||•/)
    .map(skill => skill.trim())
    .filter(skill => skill.length > 0);

  // Experience
  
  const experience =
    text.match(
      /(?:Experience|Work Experience|Professional Experience)([\s\S]*?)(?:Projects|Education|Skills|Certifications|Languages|Achievements|$)/i
    )?.[1]?.trim() || "";

  // Projects
 
  const projects =
    text.match(
      /(?:Projects|Personal Projects|Academic Projects)([\s\S]*?)(?:Education|Experience|Skills|Certifications|Languages|Achievements|$)/i
    )?.[1]?.trim() || "";

  // Education

  const education =
    text.match(
      /(?:Education|Academic Qualification|Qualifications)([\s\S]*?)(?:Projects|Experience|Skills|Certifications|Languages|Achievements|$)/i
    )?.[1]?.trim() || "";

  return {
    name,
    email,
    phone,
    skills,
    experience,
    projects,
    education,
  };
}