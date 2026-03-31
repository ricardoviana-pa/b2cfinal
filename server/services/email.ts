import axios from "axios";

const AC_URL = process.env.ACTIVECAMPAIGN_API_URL;
const AC_KEY = process.env.ACTIVECAMPAIGN_API_KEY;

function getAC() {
  if (!AC_URL || !AC_KEY) return null;
  return axios.create({
    baseURL: `${AC_URL}/api/3`,
    headers: { "Api-Token": AC_KEY, "Content-Type": "application/json" },
    timeout: 10000,
  });
}

async function syncContact(data: { email: string; firstName?: string; lastName?: string; phone?: string }) {
  const ac = getAC();
  if (!ac) { console.warn("[ActiveCampaign] Not configured, skipping"); return null; }

  const res = await ac.post("/contact/sync", {
    contact: {
      email: data.email,
      firstName: data.firstName || "",
      lastName: data.lastName || "",
      phone: data.phone || "",
    },
  });
  return res.data?.contact?.id as string | undefined;
}

async function addTag(contactId: string, tagName: string) {
  const ac = getAC();
  if (!ac || !contactId) return;

  let tagId: string | undefined;
  try {
    const search = await ac.get("/tags", { params: { search: tagName } });
    tagId = search.data?.tags?.[0]?.id;
  } catch { /* tag search failed */ }

  if (!tagId) {
    try {
      const create = await ac.post("/tags", { tag: { tag: tagName, tagType: "contact" } });
      tagId = create.data?.tag?.id;
    } catch { /* tag creation failed */ }
  }

  if (tagId) {
    await ac.post("/contactTags", { contactTag: { contact: contactId, tag: tagId } });
  }
}

async function addToList(contactId: string, listId: string) {
  const ac = getAC();
  if (!ac || !contactId) return;
  await ac.post("/contactLists", { contactList: { list: listId, contact: contactId, status: 1 } });
}

async function createNote(contactId: string, note: string) {
  const ac = getAC();
  if (!ac || !contactId) return;
  await ac.post("/notes", { note: { contact: contactId, note } });
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return { firstName: parts[0] || "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export async function sendContactConfirmation(to: string, name: string) {
  // ActiveCampaign handles confirmation emails via automations
  // We just sync the contact here
  console.log(`[ActiveCampaign] Contact form: ${to} (${name})`);
}

export async function sendContactNotification(data: { name: string; email: string; phone?: string; subject: string; message: string }) {
  try {
    const { firstName, lastName } = splitName(data.name);
    const contactId = await syncContact({ email: data.email, firstName, lastName, phone: data.phone });
    if (!contactId) return;

    await addTag(contactId, "website-contact");
    await addTag(contactId, `contact-${data.subject}`);
    await createNote(contactId, `Website contact form (${data.subject}):\n\n${data.message}`);

    const listId = process.env.ACTIVECAMPAIGN_CONTACTS_LIST_ID;
    if (listId) await addToList(contactId, listId);

    console.log(`[ActiveCampaign] Contact synced: ${data.email} → contact #${contactId}`);
  } catch (err: any) {
    console.error("[ActiveCampaign] Contact sync failed:", err.response?.data || err.message);
  }
}

export async function sendNewsletterWelcome(to: string) {
  try {
    const contactId = await syncContact({ email: to });
    if (!contactId) return;

    await addTag(contactId, "newsletter");
    await addTag(contactId, "website-subscriber");

    const listId = process.env.ACTIVECAMPAIGN_NEWSLETTER_LIST_ID;
    if (listId) await addToList(contactId, listId);

    console.log(`[ActiveCampaign] Newsletter subscriber synced: ${to} → contact #${contactId}`);
  } catch (err: any) {
    console.error("[ActiveCampaign] Newsletter sync failed:", err.response?.data || err.message);
  }
}
